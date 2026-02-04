/**
 * JWT utilities for access and refresh tokens
 * Uses native Node.js crypto for signing/verification
 * Tokens are stored in httpOnly cookies for security
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { jwt_config } from '../config/index.js';

/**
 * Parse duration string to milliseconds
 * Supports: 15m, 1h, 7d
 * @param {string} duration - Duration string
 * @returns {number} - Milliseconds
 */
function parse_duration(duration) {
  const match = duration.match(/^(\d+)([mhd])$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'm':
      return value * 60 * 1000; // minutes
    case 'h':
      return value * 60 * 60 * 1000; // hours
    case 'd':
      return value * 24 * 60 * 60 * 1000; // days
    default:
      throw new Error(`Unknown duration unit: ${unit}`);
  }
}

/**
 * Base64 URL encode (JWT-safe)
 * @param {Buffer|string} input
 * @returns {string}
 */
function base64_url_encode(input) {
  const buffer = typeof input === 'string' ? Buffer.from(input) : input;
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Base64 URL decode
 * @param {string} input
 * @returns {Buffer}
 */
function base64_url_decode(input) {
  // Restore padding
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64');
}

/**
 * Create HMAC-SHA256 signature
 * @param {string} data - Data to sign
 * @param {string} secret - Secret key
 * @returns {string} - Base64 URL encoded signature
 */
function create_signature(data, secret) {
  const hmac = createHmac('sha256', secret);
  hmac.update(data);
  return base64_url_encode(hmac.digest());
}

/**
 * Verify HMAC signature using timing-safe comparison
 * @param {string} data - Original data
 * @param {string} signature - Signature to verify
 * @param {string} secret - Secret key
 * @returns {boolean}
 */
function verify_signature(data, signature, secret) {
  const expected = create_signature(data, secret);

  // Convert to buffers for timing-safe comparison
  const sig_buf = Buffer.from(signature);
  const expected_buf = Buffer.from(expected);

  if (sig_buf.length !== expected_buf.length) {
    return false;
  }

  return timingSafeEqual(sig_buf, expected_buf);
}

/**
 * Create a JWT token
 * @param {Object} payload - Token payload
 * @param {Object} options - Token options
 * @param {string} options.expiry - Expiry duration (e.g., '15m', '7d')
 * @returns {string} - JWT token
 */
export function create_jwt(payload, options = {}) {
  const expiry = options.expiry || jwt_config.access_expiry;

  // Header
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  // Payload with standard claims
  const now = Date.now();
  const full_payload = {
    ...payload,
    iat: Math.floor(now / 1000), // Issued at
    exp: Math.floor((now + parse_duration(expiry)) / 1000), // Expiration
  };

  // Encode header and payload
  const encoded_header = base64_url_encode(JSON.stringify(header));
  const encoded_payload = base64_url_encode(JSON.stringify(full_payload));

  // Create signature
  const signature_input = `${encoded_header}.${encoded_payload}`;
  const signature = create_signature(signature_input, jwt_config.secret);

  return `${signature_input}.${signature}`;
}

/**
 * Verify and decode a JWT token
 * @param {string} token - JWT token to verify
 * @returns {{valid: boolean, payload?: Object, error?: string}}
 */
export function verify_jwt(token) {
  try {
    if (!token || typeof token !== 'string') {
      return { valid: false, error: 'Token is required' };
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid token format' };
    }

    const [encoded_header, encoded_payload, signature] = parts;

    // Verify signature
    const signature_input = `${encoded_header}.${encoded_payload}`;
    if (!verify_signature(signature_input, signature, jwt_config.secret)) {
      return { valid: false, error: 'Invalid signature' };
    }

    // Decode payload
    const payload = JSON.parse(base64_url_decode(encoded_payload).toString());

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return { valid: false, error: 'Token expired' };
    }

    return { valid: true, payload };
  } catch (err) {
    return { valid: false, error: 'Invalid token' };
  }
}

/**
 * Create an access token for a user
 * Short-lived token for API authentication
 * @param {Object} user - User object
 * @param {Object} options - Additional options
 * @param {boolean} options.is_impersonation - Is this an impersonation session
 * @param {string} options.admin_id - Admin ID if impersonating
 * @returns {string}
 */
export function create_access_token(user, options = {}) {
  const payload = {
    sub: user.id,
    username: user.username,
    is_admin: user.is_admin,
    is_verified: user.is_verified,
    type: 'access',
  };

  // Add impersonation info if present
  if (options.is_impersonation) {
    payload.is_impersonation = true;
    payload.admin_id = options.admin_id;
  }

  return create_jwt(payload, { expiry: jwt_config.access_expiry });
}

/**
 * Create a refresh token for session management
 * Longer-lived token for obtaining new access tokens
 * @param {Object} user - User object
 * @param {boolean} stay_logged_in - If true, uses longer expiry
 * @returns {string}
 */
export function create_refresh_token(user, stay_logged_in = false) {
  const payload = {
    sub: user.id,
    type: 'refresh',
    session_only: !stay_logged_in,
  };

  const expiry = stay_logged_in ? jwt_config.refresh_expiry : '24h';
  return create_jwt(payload, { expiry });
}

/**
 * Cookie options for secure token storage
 * @param {boolean} session_only - If true, cookie expires on browser close
 * @returns {Object}
 */
export function get_cookie_options(session_only = false) {
  const base_options = {
    httpOnly: true, // Prevents XSS access to cookie
    secure: process.env.ENVIRONMENT === 'PROD', // HTTPS only in production
    sameSite: 'strict', // CSRF protection
    path: '/',
  };

  if (!session_only) {
    // Set explicit max age for persistent cookies
    base_options.maxAge = parse_duration(jwt_config.refresh_expiry);
  }
  // If session_only, no maxAge = session cookie (expires on browser close)

  return base_options;
}

/**
 * Calculate token expiry date
 * @param {string} duration - Duration string
 * @returns {Date}
 */
export function get_expiry_date(duration) {
  return new Date(Date.now() + parse_duration(duration));
}
