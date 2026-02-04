/**
 * Account management routes
 * Handles soft delete, recovery, and permanent deletion
 */

import { Router } from 'express';
import { query, with_transaction } from '../db/pool.js';
import { verify_password } from '../utils/crypto.js';
import { send_account_deleted_email, send_account_recovered_email } from '../services/email.js';
import { delete_avatar } from '../services/s3.js';
import { require_auth } from '../middleware/auth.js';

const router = Router();

// All account routes require authentication
router.use(require_auth);

/**
 * POST /api/account/delete
 * Soft delete account (user-initiated, can recover within 30 days)
 */
router.post('/delete', async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password required to delete account' });
    }

    // Get user's password hash
    const user_result = await query(
      `SELECT password_hash, password_salt, email, deleted_at FROM users WHERE id = $1`,
      [req.user.id]
    );

    const user = user_result.rows[0];

    // Check if already deleted
    if (user.deleted_at) {
      return res.status(400).json({ error: 'Account already deleted' });
    }

    // Verify password
    const password_valid = await verify_password(
      password,
      user.password_hash,
      user.password_salt
    );

    if (!password_valid) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    // Soft delete
    await with_transaction(async (client) => {
      await client.query(
        `UPDATE users SET deleted_at = NOW(), deleted_by_admin = false WHERE id = $1`,
        [req.user.id]
      );

      // Invalidate all sessions
      await client.query(
        `DELETE FROM refresh_tokens WHERE user_id = $1`,
        [req.user.id]
      );
    });

    // Send notification (can_recover = true for user-initiated delete)
    send_account_deleted_email(user.email, req.user.username, true)
      .catch((err) => console.error('Failed to send delete email:', err));

    // Clear cookies
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/' });

    res.json({
      message: 'Account deactivated',
      recovery_days: 30,
    });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

/**
 * POST /api/account/recover
 * Recover a soft-deleted account
 * Only works for user-initiated deletes within 30 days
 */
router.post('/recover', async (req, res) => {
  try {
    // Get user status
    const user_result = await query(
      `SELECT deleted_at, deleted_by_admin, email FROM users WHERE id = $1`,
      [req.user.id]
    );

    const user = user_result.rows[0];

    if (!user.deleted_at) {
      return res.status(400).json({ error: 'Account is not deleted' });
    }

    // Check if admin-deleted (cannot recover)
    if (user.deleted_by_admin) {
      return res.status(403).json({
        error: 'Account cannot be recovered',
        message: 'This account was deleted by an administrator',
      });
    }

    // Check if within 30-day window
    const deleted_date = new Date(user.deleted_at);
    const days_since_delete = (Date.now() - deleted_date.getTime()) / (1000 * 60 * 60 * 24);

    if (days_since_delete > 30) {
      return res.status(403).json({
        error: 'Recovery period expired',
        message: 'Account can only be recovered within 30 days of deletion',
      });
    }

    // Recover account
    await query(
      `UPDATE users SET deleted_at = NULL, deleted_by_admin = false WHERE id = $1`,
      [req.user.id]
    );

    // Send notification
    send_account_recovered_email(user.email, req.user.username)
      .catch((err) => console.error('Failed to send recovery email:', err));

    res.json({ message: 'Account recovered successfully' });
  } catch (err) {
    console.error('Recover account error:', err);
    res.status(500).json({ error: 'Failed to recover account' });
  }
});

/**
 * POST /api/account/permanent-delete
 * Permanently delete account (skip 30-day waiting period)
 * Only works for user-initiated soft deletes
 */
router.post('/permanent-delete', async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password required for permanent deletion' });
    }

    // Get user status
    const user_result = await query(
      `SELECT password_hash, password_salt, deleted_at, deleted_by_admin, avatar_url FROM users WHERE id = $1`,
      [req.user.id]
    );

    const user = user_result.rows[0];

    // Must be soft-deleted first
    if (!user.deleted_at) {
      return res.status(400).json({
        error: 'Account must be deactivated first',
        message: 'Please deactivate your account before permanent deletion',
      });
    }

    // Cannot permanent delete if admin-deleted
    if (user.deleted_by_admin) {
      return res.status(403).json({
        error: 'Account cannot be permanently deleted',
        message: 'Please contact support',
      });
    }

    // Verify password
    const password_valid = await verify_password(
      password,
      user.password_hash,
      user.password_salt
    );

    if (!password_valid) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    // Delete avatar from S3 if exists
    if (user.avatar_url && user.avatar_url.includes('s3.')) {
      await delete_avatar(req.user.id);
    }

    // Permanently delete user and all related data
    await query(`DELETE FROM users WHERE id = $1`, [req.user.id]);

    // Clear cookies
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/' });

    res.json({ message: 'Account permanently deleted' });
  } catch (err) {
    console.error('Permanent delete error:', err);
    res.status(500).json({ error: 'Failed to permanently delete account' });
  }
});

/**
 * GET /api/account/status
 * Get account deletion status
 */
router.get('/status', async (req, res) => {
  try {
    const result = await query(
      `SELECT deleted_at, deleted_by_admin FROM users WHERE id = $1`,
      [req.user.id]
    );

    const user = result.rows[0];

    if (!user.deleted_at) {
      return res.json({
        status: 'active',
        deleted_at: null,
        can_recover: false,
        days_remaining: null,
      });
    }

    const deleted_date = new Date(user.deleted_at);
    const days_since_delete = (Date.now() - deleted_date.getTime()) / (1000 * 60 * 60 * 24);
    const days_remaining = Math.max(0, Math.ceil(30 - days_since_delete));

    res.json({
      status: 'deleted',
      deleted_at: user.deleted_at,
      can_recover: !user.deleted_by_admin && days_remaining > 0,
      deleted_by_admin: user.deleted_by_admin,
      days_remaining: user.deleted_by_admin ? null : days_remaining,
    });
  } catch (err) {
    console.error('Get account status error:', err);
    res.status(500).json({ error: 'Failed to get account status' });
  }
});

export default router;
