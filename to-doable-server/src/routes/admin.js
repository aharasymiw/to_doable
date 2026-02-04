/**
 * Admin routes
 * User management, impersonation, and admin-only operations
 */

import { Router } from 'express';
import { query, with_transaction } from '../db/pool.js';
import { hash_password, generate_token, hash_token } from '../utils/crypto.js';
import {
  validate_email,
  validate_username,
  validate_password,
  validate_uuid,
  validate_pagination,
  validate_search_query,
  validate_bio,
  validate_phone,
  validate_pronouns,
  sanitize_html,
} from '../utils/validation.js';
import { create_access_token, get_cookie_options, get_expiry_date } from '../utils/jwt.js';
import { send_verification_email, send_account_deleted_email } from '../services/email.js';
import { require_auth, require_admin, block_deleted_users } from '../middleware/auth.js';
import { idempotency } from '../middleware/idempotency.js';
import { email_config } from '../config/index.js';

const router = Router();

// All admin routes require authentication and admin role
router.use(require_auth);
router.use(require_admin);
router.use(block_deleted_users);

/**
 * GET /api/admin/users
 * List all users with pagination, search, and filtering
 */
router.get('/users', async (req, res) => {
  try {
    const { page, limit } = validate_pagination(req.query.page, req.query.limit);
    const search = validate_search_query(req.query.search);
    const status = req.query.status; // verified, unverified, deleted, admin-deleted, blocked

    // Build query conditions
    const conditions = [];
    const params = [];
    let param_count = 1;

    // Search by username or email
    if (search.value) {
      conditions.push(`(LOWER(username) LIKE $${param_count} OR LOWER(email) LIKE $${param_count})`);
      params.push(`%${search.value.toLowerCase()}%`);
      param_count++;
    }

    // Filter by status
    if (status) {
      switch (status) {
        case 'verified':
          conditions.push('is_verified = true AND deleted_at IS NULL');
          break;
        case 'unverified':
          conditions.push('is_verified = false AND deleted_at IS NULL');
          break;
        case 'deleted':
          conditions.push('deleted_at IS NOT NULL AND deleted_by_admin = false');
          break;
        case 'admin-deleted':
          conditions.push('deleted_at IS NOT NULL AND deleted_by_admin = true');
          break;
        case 'blocked':
          conditions.push(`id IN (
            SELECT user_id FROM rate_limit_login_user
            WHERE (blocked_until IS NOT NULL AND blocked_until > NOW())
               OR (block_count >= 4 AND blocked_until IS NULL)
          )`);
          break;
      }
    }

    const where_clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const count_result = await query(
      `SELECT COUNT(*) FROM users ${where_clause}`,
      params
    );
    const total = parseInt(count_result.rows[0].count, 10);

    // Build pagination
    let pagination_clause = '';
    if (limit !== null) {
      const offset = (page - 1) * limit;
      pagination_clause = `LIMIT ${limit} OFFSET ${offset}`;
    }

    // Get users
    const users_result = await query(
      `SELECT id, username, email, avatar_url, bio, phone, pronouns, is_admin, is_verified, deleted_at, deleted_by_admin, created_at, updated_at
       FROM users
       ${where_clause}
       ORDER BY created_at DESC
       ${pagination_clause}`,
      params
    );

    res.json({
      users: users_result.rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: limit ? Math.ceil(total / limit) : 1,
      },
    });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

/**
 * GET /api/admin/users/:id
 * Get single user details
 */
router.get('/users/:id', async (req, res) => {
  try {
    const id_result = validate_uuid(req.params.id);
    if (!id_result.valid) {
      return res.status(400).json({ error: id_result.error });
    }

    const result = await query(
      `SELECT u.id, u.username, u.email, u.avatar_url, u.bio, u.phone, u.pronouns,
              u.is_admin, u.is_verified, u.deleted_at, u.deleted_by_admin, u.created_at, u.updated_at,
              rl.blocked_until, rl.block_count,
              (SELECT COUNT(*) FROM refresh_tokens WHERE user_id = u.id AND expires_at > NOW()) as active_sessions
       FROM users u
       LEFT JOIN rate_limit_login_user rl ON u.id = rl.user_id
       WHERE u.id = $1`,
      [id_result.value]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

/**
 * POST /api/admin/users
 * Create a new user (admin can create pre-verified users)
 */
router.post('/users', idempotency({ required: true }), async (req, res) => {
  try {
    const { username, email, password, is_verified = false, is_admin = false } = req.body;

    // Validate inputs
    const username_result = validate_username(username);
    if (!username_result.valid) {
      return res.status(400).json({ error: username_result.error });
    }

    const email_result = validate_email(email);
    if (!email_result.valid) {
      return res.status(400).json({ error: email_result.error });
    }

    const password_result = validate_password(password);
    if (!password_result.valid) {
      return res.status(400).json({ error: password_result.error });
    }

    // Check for existing user
    const existing = await query(
      `SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)`,
      [username_result.value, email_result.value]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    // Hash password
    const { hash, salt } = await hash_password(password);

    // Create user
    const user = await with_transaction(async (client) => {
      const user_result = await client.query(
        `INSERT INTO users (username, email, password_hash, password_salt, is_verified, is_admin)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, username, email, is_admin, is_verified, created_at`,
        [username_result.value, email_result.value, hash, salt, is_verified, is_admin]
      );

      const new_user = user_result.rows[0];

      // If not pre-verified, create verification token
      if (!is_verified) {
        const verification_token = generate_token();
        await client.query(
          `INSERT INTO email_verifications (user_id, token, expires_at)
           VALUES ($1, $2, NOW() + INTERVAL '${email_config.verification_expiry_hours} hours')`,
          [new_user.id, hash_token(verification_token)]
        );

        // Send verification email
        send_verification_email(email_result.value, username_result.value, verification_token)
          .catch((err) => console.error('Failed to send verification email:', err));
      }

      return new_user;
    });

    res.status(201).json({
      message: 'User created',
      user,
    });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

/**
 * PATCH /api/admin/users/:id
 * Update user details
 */
router.patch('/users/:id', idempotency({ required: true }), async (req, res) => {
  try {
    const id_result = validate_uuid(req.params.id);
    if (!id_result.valid) {
      return res.status(400).json({ error: id_result.error });
    }

    const { bio, phone, pronouns, is_verified, is_admin } = req.body;
    const updates = [];
    const values = [];
    let param_count = 1;

    // Validate and add fields
    if (bio !== undefined) {
      const bio_result = validate_bio(bio);
      if (!bio_result.valid) {
        return res.status(400).json({ error: bio_result.error });
      }
      updates.push(`bio = $${param_count++}`);
      values.push(bio_result.value ? sanitize_html(bio_result.value) : null);
    }

    if (phone !== undefined) {
      const phone_result = validate_phone(phone);
      if (!phone_result.valid) {
        return res.status(400).json({ error: phone_result.error });
      }
      updates.push(`phone = $${param_count++}`);
      values.push(phone_result.value);
    }

    if (pronouns !== undefined) {
      const pronouns_result = validate_pronouns(pronouns);
      if (!pronouns_result.valid) {
        return res.status(400).json({ error: pronouns_result.error });
      }
      updates.push(`pronouns = $${param_count++}`);
      values.push(pronouns_result.value ? sanitize_html(pronouns_result.value) : null);
    }

    if (typeof is_verified === 'boolean') {
      updates.push(`is_verified = $${param_count++}`);
      values.push(is_verified);
    }

    // Only allow changing admin status for non-self users
    if (typeof is_admin === 'boolean' && id_result.value !== req.user.id) {
      updates.push(`is_admin = $${param_count++}`);
      values.push(is_admin);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    values.push(id_result.value);

    const result = await query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${param_count}
       RETURNING id, username, email, avatar_url, bio, phone, pronouns, is_admin, is_verified, created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'User updated',
      user: result.rows[0],
    });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Delete user (soft delete with 30-day retention, user cannot recover)
 */
router.delete('/users/:id', async (req, res) => {
  try {
    const id_result = validate_uuid(req.params.id);
    if (!id_result.valid) {
      return res.status(400).json({ error: id_result.error });
    }

    // Cannot delete yourself
    if (id_result.value === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Get user for email notification
    const user_result = await query(
      `SELECT username, email, deleted_at FROM users WHERE id = $1`,
      [id_result.value]
    );

    if (user_result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = user_result.rows[0];

    if (user.deleted_at) {
      return res.status(400).json({ error: 'User already deleted' });
    }

    // Soft delete with admin flag (user cannot recover)
    await with_transaction(async (client) => {
      await client.query(
        `UPDATE users SET deleted_at = NOW(), deleted_by_admin = true WHERE id = $1`,
        [id_result.value]
      );

      // Invalidate all sessions
      await client.query(
        `DELETE FROM refresh_tokens WHERE user_id = $1`,
        [id_result.value]
      );
    });

    // Send notification (can_recover = false for admin delete)
    send_account_deleted_email(user.email, user.username, false)
      .catch((err) => console.error('Failed to send delete email:', err));

    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

/**
 * POST /api/admin/users/:id/unblock
 * Remove rate limit blocks from user
 */
router.post('/users/:id/unblock', async (req, res) => {
  try {
    const id_result = validate_uuid(req.params.id);
    if (!id_result.valid) {
      return res.status(400).json({ error: id_result.error });
    }

    await query(
      `UPDATE rate_limit_login_user
       SET blocked_until = NULL, consecutive_failures = 0, block_count = 0
       WHERE user_id = $1`,
      [id_result.value]
    );

    res.json({ message: 'User unblocked' });
  } catch (err) {
    console.error('Unblock user error:', err);
    res.status(500).json({ error: 'Failed to unblock user' });
  }
});

/**
 * POST /api/admin/impersonate/:id
 * Start impersonation session for a user
 * Returns token that should be used in a new tab
 */
router.post('/impersonate/:id', async (req, res) => {
  try {
    const id_result = validate_uuid(req.params.id);
    if (!id_result.valid) {
      return res.status(400).json({ error: id_result.error });
    }

    // Cannot impersonate yourself
    if (id_result.value === req.user.id) {
      return res.status(400).json({ error: 'Cannot impersonate yourself' });
    }

    // Get target user
    const user_result = await query(
      `SELECT id, username, email, is_admin, is_verified, deleted_at FROM users WHERE id = $1`,
      [id_result.value]
    );

    if (user_result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const target_user = user_result.rows[0];

    // Generate impersonation token
    const impersonation_token = generate_token();
    const token_hash = hash_token(impersonation_token);
    const expires_at = get_expiry_date('1h'); // Impersonation sessions expire in 1 hour

    // Store impersonation session
    await query(
      `INSERT INTO impersonation_sessions (admin_id, target_user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [req.user.id, id_result.value, token_hash, expires_at]
    );

    // Create access token for impersonation
    const access_token = create_access_token(target_user, {
      is_impersonation: true,
      admin_id: req.user.id,
    });

    res.json({
      message: 'Impersonation session created',
      impersonation_token,
      access_token,
      target_user: {
        id: target_user.id,
        username: target_user.username,
        email: target_user.email,
      },
      expires_at,
    });
  } catch (err) {
    console.error('Impersonate error:', err);
    res.status(500).json({ error: 'Failed to start impersonation' });
  }
});

/**
 * POST /api/admin/impersonate/end
 * End impersonation session
 */
router.post('/impersonate/end', async (req, res) => {
  try {
    const { impersonation_token } = req.body;

    if (impersonation_token) {
      const token_hash = hash_token(impersonation_token);
      await query(
        `UPDATE impersonation_sessions SET ended_at = NOW() WHERE token_hash = $1`,
        [token_hash]
      );
    }

    res.json({ message: 'Impersonation ended' });
  } catch (err) {
    console.error('End impersonation error:', err);
    res.status(500).json({ error: 'Failed to end impersonation' });
  }
});

/**
 * POST /api/admin/users/:id/reset-password
 * Reset user password (admin action)
 */
router.post('/users/:id/reset-password', idempotency({ required: true }), async (req, res) => {
  try {
    const id_result = validate_uuid(req.params.id);
    if (!id_result.valid) {
      return res.status(400).json({ error: id_result.error });
    }

    const { new_password } = req.body;

    const password_result = validate_password(new_password);
    if (!password_result.valid) {
      return res.status(400).json({ error: password_result.error });
    }

    // Hash new password
    const { hash, salt } = await hash_password(new_password);

    // Update password and invalidate sessions
    await with_transaction(async (client) => {
      await client.query(
        `UPDATE users SET password_hash = $1, password_salt = $2, updated_at = NOW() WHERE id = $3`,
        [hash, salt, id_result.value]
      );

      await client.query(
        `DELETE FROM refresh_tokens WHERE user_id = $1`,
        [id_result.value]
      );
    });

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;
