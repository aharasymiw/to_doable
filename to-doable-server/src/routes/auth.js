/**
 * Authentication routes
 * Handles registration, login, logout, email verification, password change
 */

import { Router } from 'express';
import { query, with_transaction } from '../db/pool.js';
import { hash_password, verify_password, generate_token, hash_token } from '../utils/crypto.js';
import {
  validate_email,
  validate_username,
  validate_password,
} from '../utils/validation.js';
import {
  create_access_token,
  create_refresh_token,
  get_cookie_options,
  get_expiry_date,
} from '../utils/jwt.js';
import { send_verification_email, send_password_changed_email } from '../services/email.js';
import { rate_limit_registration, rate_limit_login_ip, record_login_failure, reset_login_failures, check_user_login_block } from '../middleware/rate-limit.js';
import { require_auth, block_deleted_users } from '../middleware/auth.js';
import { idempotency } from '../middleware/idempotency.js';
import { email_config, jwt_config } from '../config/index.js';

const router = Router();

/**
 * POST /api/auth/register
 * Create a new user account
 */
router.post(
  '/register',
  rate_limit_registration,
  idempotency({ required: true }),
  async (req, res) => {
    try {
      const { username, email, password } = req.body;

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
        return res.status(409).json({
          error: 'Username or email already exists',
        });
      }

      // Hash password
      const { hash, salt } = await hash_password(password);

      // Generate verification token
      const verification_token = generate_token();

      // Create user in transaction
      const user = await with_transaction(async (client) => {
        // Insert user
        const user_result = await client.query(
          `INSERT INTO users (username, email, password_hash, password_salt)
           VALUES ($1, $2, $3, $4)
           RETURNING id, username, email, is_admin, is_verified`,
          [username_result.value, email_result.value, hash, salt]
        );

        const new_user = user_result.rows[0];

        // Create verification record
        await client.query(
          `INSERT INTO email_verifications (user_id, token, expires_at)
           VALUES ($1, $2, NOW() + INTERVAL '${email_config.verification_expiry_hours} hours')`,
          [new_user.id, hash_token(verification_token)]
        );

        return new_user;
      });

      // Send verification email (async, don't block response)
      send_verification_email(email_result.value, username_result.value, verification_token)
        .catch((err) => console.error('Failed to send verification email:', err));

      res.status(201).json({
        message: 'Account created successfully',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          is_verified: user.is_verified,
        },
      });
    } catch (err) {
      console.error('Registration error:', err);
      res.status(500).json({ error: 'Registration failed' });
    }
  }
);

/**
 * POST /api/auth/login
 * Authenticate user and issue tokens
 */
router.post('/login', rate_limit_login_ip, async (req, res) => {
  try {
    const { username, password, stay_logged_in = false } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // Find user by username or email
    const user_result = await query(
      `SELECT id, username, email, password_hash, password_salt, is_admin, is_verified, deleted_at, deleted_by_admin
       FROM users
       WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1)`,
      [username]
    );

    if (user_result.rows.length === 0) {
      // Timing-safe: still verify against dummy password
      await verify_password(password, 'dummy_hash_to_prevent_timing_attack', 'dummy_salt');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = user_result.rows[0];

    // Check if user is blocked from login
    const block_status = await check_user_login_block(user.id);
    if (block_status.blocked) {
      if (block_status.permanent) {
        return res.status(403).json({
          error: 'Account locked',
          message: 'Too many failed login attempts. Please contact support.',
        });
      }

      const remaining = Math.ceil((block_status.until - new Date()) / 1000);
      return res.status(429).json({
        error: 'Account temporarily locked',
        retry_after: remaining,
      });
    }

    // Verify password
    const password_valid = await verify_password(
      password,
      user.password_hash,
      user.password_salt
    );

    if (!password_valid) {
      // Record failure
      const failure_result = await record_login_failure(user.id);

      if (failure_result.blocked) {
        return res.status(429).json({
          error: 'Account temporarily locked',
          message: 'Too many failed login attempts',
          retry_after: failure_result.duration,
        });
      }

      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Reset failure counter on success
    await reset_login_failures(user.id);

    // Check for soft-deleted account (user-deleted, can recover)
    if (user.deleted_at && !user.deleted_by_admin) {
      // Issue limited tokens for recovery flow
      const access_token = create_access_token(user);
      const refresh_token = create_refresh_token(user, stay_logged_in);

      // Store refresh token
      await store_refresh_token(user.id, refresh_token, stay_logged_in, req);

      // Set cookies
      set_auth_cookies(res, access_token, refresh_token, stay_logged_in);

      return res.json({
        message: 'Account is deactivated',
        code: 'ACCOUNT_DELETED',
        can_recover: true,
        user: {
          id: user.id,
          username: user.username,
          deleted_at: user.deleted_at,
        },
      });
    }

    // Check for admin-deleted account (cannot recover)
    if (user.deleted_at && user.deleted_by_admin) {
      return res.status(403).json({
        error: 'Account has been deleted',
        can_recover: false,
      });
    }

    // Create tokens
    const access_token = create_access_token(user);
    const refresh_token = create_refresh_token(user, stay_logged_in);

    // Store refresh token
    await store_refresh_token(user.id, refresh_token, stay_logged_in, req);

    // Set cookies
    set_auth_cookies(res, access_token, refresh_token, stay_logged_in);

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        is_admin: user.is_admin,
        is_verified: user.is_verified,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/auth/logout
 * Invalidate tokens and clear cookies
 */
router.post('/logout', require_auth, async (req, res) => {
  try {
    const refresh_token = req.cookies?.refresh_token;

    if (refresh_token) {
      // Revoke refresh token
      const token_hash = hash_token(refresh_token);
      await query(
        `DELETE FROM refresh_tokens WHERE token_hash = $1`,
        [token_hash]
      );
    }

    // Clear cookies
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/' });

    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    // Still clear cookies even on error
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/' });
    res.json({ message: 'Logged out' });
  }
});

/**
 * POST /api/auth/refresh
 * Get new access token using refresh token
 */
router.post('/refresh', async (req, res) => {
  try {
    const refresh_token = req.cookies?.refresh_token;

    if (!refresh_token) {
      return res.status(401).json({ error: 'No refresh token' });
    }

    const token_hash = hash_token(refresh_token);

    // Verify token exists and is valid
    const result = await query(
      `SELECT rt.*, u.id as user_id, u.username, u.email, u.is_admin, u.is_verified, u.deleted_at
       FROM refresh_tokens rt
       JOIN users u ON rt.user_id = u.id
       WHERE rt.token_hash = $1 AND rt.expires_at > NOW()`,
      [token_hash]
    );

    if (result.rows.length === 0) {
      res.clearCookie('access_token', { path: '/' });
      res.clearCookie('refresh_token', { path: '/' });
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const record = result.rows[0];

    // Update last used
    await query(
      `UPDATE refresh_tokens SET last_used_at = NOW() WHERE token_hash = $1`,
      [token_hash]
    );

    // Create new access token
    const user = {
      id: record.user_id,
      username: record.username,
      is_admin: record.is_admin,
      is_verified: record.is_verified,
    };

    const access_token = create_access_token(user);

    // Set new access token cookie
    res.cookie('access_token', access_token, {
      ...get_cookie_options(record.is_session_only),
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.json({
      message: 'Token refreshed',
      user: {
        id: record.user_id,
        username: record.username,
        email: record.email,
        is_admin: record.is_admin,
        is_verified: record.is_verified,
        deleted_at: record.deleted_at,
      },
    });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

/**
 * GET /api/auth/verify-email
 * Verify email using token from query param
 */
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'Verification token required' });
    }

    const token_hash = hash_token(token);

    // Find and validate verification record
    const result = await query(
      `SELECT ev.user_id, u.username, u.is_verified
       FROM email_verifications ev
       JOIN users u ON ev.user_id = u.id
       WHERE ev.token = $1 AND ev.expires_at > NOW()`,
      [token_hash]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        error: 'Invalid or expired verification link',
      });
    }

    const record = result.rows[0];

    if (record.is_verified) {
      return res.json({ message: 'Email already verified' });
    }

    // Update user as verified
    await with_transaction(async (client) => {
      await client.query(
        `UPDATE users SET is_verified = true WHERE id = $1`,
        [record.user_id]
      );

      // Delete verification record
      await client.query(
        `DELETE FROM email_verifications WHERE user_id = $1`,
        [record.user_id]
      );
    });

    res.json({ message: 'Email verified successfully' });
  } catch (err) {
    console.error('Email verification error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

/**
 * POST /api/auth/resend-verification
 * Resend verification email (with cooldown)
 */
router.post('/resend-verification', require_auth, async (req, res) => {
  try {
    const user = req.user;

    if (user.is_verified) {
      return res.status(400).json({ error: 'Email already verified' });
    }

    // Check cooldown
    const existing = await query(
      `SELECT last_sent_at FROM email_verifications
       WHERE user_id = $1 AND last_sent_at > NOW() - INTERVAL '${email_config.resend_cooldown_minutes} minutes'`,
      [user.id]
    );

    if (existing.rows.length > 0) {
      const wait_time = Math.ceil(
        (new Date(existing.rows[0].last_sent_at).getTime() +
          email_config.resend_cooldown_minutes * 60 * 1000 -
          Date.now()) /
          1000
      );

      return res.status(429).json({
        error: 'Please wait before requesting another verification email',
        retry_after: wait_time,
      });
    }

    // Get user email
    const user_result = await query(
      `SELECT email FROM users WHERE id = $1`,
      [user.id]
    );

    // Generate new token
    const verification_token = generate_token();
    const token_hash = hash_token(verification_token);

    // Update or create verification record
    await query(
      `INSERT INTO email_verifications (user_id, token, expires_at, last_sent_at)
       VALUES ($1, $2, NOW() + INTERVAL '${email_config.verification_expiry_hours} hours', NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         token = $2,
         expires_at = NOW() + INTERVAL '${email_config.verification_expiry_hours} hours',
         last_sent_at = NOW()`,
      [user.id, token_hash]
    );

    // Send email
    await send_verification_email(
      user_result.rows[0].email,
      user.username,
      verification_token
    );

    res.json({ message: 'Verification email sent' });
  } catch (err) {
    console.error('Resend verification error:', err);
    res.status(500).json({ error: 'Failed to send verification email' });
  }
});

/**
 * POST /api/auth/change-password
 * Change password for authenticated user
 */
router.post(
  '/change-password',
  require_auth,
  block_deleted_users,
  async (req, res) => {
    try {
      const { current_password, new_password } = req.body;

      if (!current_password || !new_password) {
        return res.status(400).json({
          error: 'Current password and new password required',
        });
      }

      // Validate new password
      const password_result = validate_password(new_password);
      if (!password_result.valid) {
        return res.status(400).json({ error: password_result.error });
      }

      // Get current password hash
      const user_result = await query(
        `SELECT password_hash, password_salt, email FROM users WHERE id = $1`,
        [req.user.id]
      );

      const user = user_result.rows[0];

      // Verify current password
      const current_valid = await verify_password(
        current_password,
        user.password_hash,
        user.password_salt
      );

      if (!current_valid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      // Hash new password
      const { hash, salt } = await hash_password(new_password);

      // Update password
      await query(
        `UPDATE users SET password_hash = $1, password_salt = $2 WHERE id = $3`,
        [hash, salt, req.user.id]
      );

      // Invalidate all refresh tokens (force re-login on other devices)
      await query(
        `DELETE FROM refresh_tokens WHERE user_id = $1`,
        [req.user.id]
      );

      // Send notification email
      send_password_changed_email(user.email, req.user.username)
        .catch((err) => console.error('Failed to send password change email:', err));

      // Clear current cookies (user will need to login again)
      res.clearCookie('access_token', { path: '/' });
      res.clearCookie('refresh_token', { path: '/' });

      res.json({
        message: 'Password changed successfully. Please log in again.',
      });
    } catch (err) {
      console.error('Password change error:', err);
      res.status(500).json({ error: 'Failed to change password' });
    }
  }
);

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
router.get('/me', require_auth, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, username, email, avatar_url, bio, phone, pronouns, is_admin, is_verified, deleted_at, created_at, updated_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    res.json({
      user,
      impersonation: req.impersonation || null,
    });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Helper functions

/**
 * Store refresh token in database
 */
async function store_refresh_token(user_id, token, stay_logged_in, req) {
  const token_hash = hash_token(token);
  const expires_at = get_expiry_date(stay_logged_in ? jwt_config.refresh_expiry : '24h');

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, is_session_only, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      user_id,
      token_hash,
      expires_at,
      !stay_logged_in,
      req.headers['user-agent'] || null,
      req.ip || null,
    ]
  );
}

/**
 * Set authentication cookies
 */
function set_auth_cookies(res, access_token, refresh_token, stay_logged_in) {
  const cookie_options = get_cookie_options(!stay_logged_in);

  res.cookie('access_token', access_token, {
    ...cookie_options,
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  res.cookie('refresh_token', refresh_token, cookie_options);
}

export default router;
