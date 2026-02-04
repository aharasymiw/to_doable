/**
 * Authentication middleware
 * Validates JWT tokens from cookies
 * Handles access tokens and refresh token rotation
 */

import { verify_jwt, create_access_token, get_cookie_options } from '../utils/jwt.js';
import { query } from '../db/pool.js';
import { hash_token } from '../utils/crypto.js';

/**
 * Extract access token from cookies
 * @param {Request} req
 * @returns {string|null}
 */
function get_access_token(req) {
  return req.cookies?.access_token || null;
}

/**
 * Extract refresh token from cookies
 * @param {Request} req
 * @returns {string|null}
 */
function get_refresh_token(req) {
  return req.cookies?.refresh_token || null;
}

/**
 * Require authentication middleware
 * Verifies access token and attaches user to request
 * Returns 401 if not authenticated
 */
export async function require_auth(req, res, next) {
  const access_token = get_access_token(req);

  if (!access_token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const result = verify_jwt(access_token);

  if (!result.valid) {
    // Try to refresh the token
    const refresh_token = get_refresh_token(req);

    if (refresh_token) {
      const refreshed = await try_refresh_token(req, res, refresh_token);
      if (refreshed) {
        return next();
      }
    }

    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Check if user still exists and is not deleted
  const user = await get_user_by_id(result.payload.sub);

  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  // Attach user to request
  req.user = {
    id: user.id,
    username: user.username,
    email: user.email,
    is_admin: user.is_admin,
    is_verified: user.is_verified,
    deleted_at: user.deleted_at,
  };

  // Check for impersonation
  if (result.payload.is_impersonation) {
    req.impersonation = {
      is_impersonating: true,
      admin_id: result.payload.admin_id,
    };
  }

  next();
}

/**
 * Optional authentication middleware
 * Like require_auth but doesn't fail if no token
 * Useful for endpoints that work differently when logged in
 */
export async function optional_auth(req, res, next) {
  const access_token = get_access_token(req);

  if (!access_token) {
    return next();
  }

  const result = verify_jwt(access_token);

  if (!result.valid) {
    return next();
  }

  const user = await get_user_by_id(result.payload.sub);

  if (user) {
    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      is_admin: user.is_admin,
      is_verified: user.is_verified,
      deleted_at: user.deleted_at,
    };

    if (result.payload.is_impersonation) {
      req.impersonation = {
        is_impersonating: true,
        admin_id: result.payload.admin_id,
      };
    }
  }

  next();
}

/**
 * Require admin role middleware
 * Must be used after require_auth
 */
export function require_admin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}

/**
 * Require verified email middleware
 * Must be used after require_auth
 * Used for actions that require email verification
 */
export function require_verified(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!req.user.is_verified) {
    return res.status(403).json({
      error: 'Email verification required',
      code: 'EMAIL_NOT_VERIFIED',
    });
  }

  next();
}

/**
 * Block deleted users middleware
 * Allows only recovery-related actions for soft-deleted users
 */
export function block_deleted_users(req, res, next) {
  if (req.user && req.user.deleted_at) {
    return res.status(403).json({
      error: 'Account is deactivated',
      code: 'ACCOUNT_DELETED',
      can_recover: true,
    });
  }

  next();
}

/**
 * Try to refresh access token using refresh token
 * @param {Request} req
 * @param {Response} res
 * @param {string} refresh_token
 * @returns {Promise<boolean>}
 */
async function try_refresh_token(req, res, refresh_token) {
  try {
    const result = verify_jwt(refresh_token);

    if (!result.valid || result.payload.type !== 'refresh') {
      return false;
    }

    // Verify refresh token exists in database
    const token_hash = hash_token(refresh_token);
    const db_result = await query(
      `SELECT rt.*, u.id, u.username, u.email, u.is_admin, u.is_verified, u.deleted_at
       FROM refresh_tokens rt
       JOIN users u ON rt.user_id = u.id
       WHERE rt.token_hash = $1 AND rt.expires_at > NOW()`,
      [token_hash]
    );

    if (db_result.rows.length === 0) {
      return false;
    }

    const record = db_result.rows[0];

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

    const new_access_token = create_access_token(user);

    // Set new access token cookie
    res.cookie('access_token', new_access_token, {
      ...get_cookie_options(record.is_session_only),
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    // Attach user to request
    req.user = {
      id: record.user_id,
      username: record.username,
      email: record.email,
      is_admin: record.is_admin,
      is_verified: record.is_verified,
      deleted_at: record.deleted_at,
    };

    return true;
  } catch (err) {
    console.error('Token refresh error:', err);
    return false;
  }
}

/**
 * Get user by ID from database
 * @param {string} user_id
 * @returns {Promise<Object|null>}
 */
async function get_user_by_id(user_id) {
  try {
    const result = await query(
      `SELECT id, username, email, is_admin, is_verified, deleted_at
       FROM users WHERE id = $1`,
      [user_id]
    );

    return result.rows[0] || null;
  } catch (err) {
    console.error('Get user error:', err);
    return null;
  }
}
