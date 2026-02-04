/**
 * Security middleware
 * Handles CSRF protection, XSS prevention, and other security measures
 */

import { randomBytes } from 'crypto';
import { safe_compare } from '../utils/crypto.js';
import { server_config } from '../config/index.js';

/**
 * Generate CSRF token
 * @returns {string}
 */
export function generate_csrf_token() {
  return randomBytes(32).toString('hex');
}

/**
 * CSRF protection middleware
 * Uses double-submit cookie pattern
 * Token is sent in cookie and must be echoed in header
 */
export function csrf_protection(req, res, next) {
  // Skip for safe methods
  const safe_methods = ['GET', 'HEAD', 'OPTIONS'];
  if (safe_methods.includes(req.method)) {
    return next();
  }

  // Get token from cookie and header
  const cookie_token = req.cookies?.csrf_token;
  const header_token = req.headers['x-csrf-token'];

  // If no token exists, generate one and require retry
  if (!cookie_token) {
    const new_token = generate_csrf_token();
    res.cookie('csrf_token', new_token, {
      httpOnly: false, // Must be readable by JS to send in header
      secure: server_config.is_prod,
      sameSite: 'strict',
      path: '/',
    });

    return res.status(403).json({
      error: 'CSRF token missing',
      message: 'Please retry the request',
    });
  }

  // Verify token matches
  if (!header_token || !safe_compare(cookie_token, header_token)) {
    return res.status(403).json({
      error: 'CSRF token invalid',
      message: 'Request blocked for security',
    });
  }

  // Rotate token on each request for extra security
  const new_token = generate_csrf_token();
  res.cookie('csrf_token', new_token, {
    httpOnly: false,
    secure: server_config.is_prod,
    sameSite: 'strict',
    path: '/',
  });

  next();
}

/**
 * Set CSRF token cookie on GET requests
 * Ensures client always has a valid token
 */
export function csrf_token_setter(req, res, next) {
  if (req.method === 'GET' && !req.cookies?.csrf_token) {
    const token = generate_csrf_token();
    res.cookie('csrf_token', token, {
      httpOnly: false,
      secure: server_config.is_prod,
      sameSite: 'strict',
      path: '/',
    });
  }
  next();
}

/**
 * Security headers middleware
 * Sets various headers to prevent common attacks
 */
export function security_headers(req, res, next) {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // XSS protection (legacy browsers)
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions policy (disable unnecessary features)
  res.setHeader(
    'Permissions-Policy',
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
  );

  // Content Security Policy
  // Adjust as needed for your application
  if (server_config.is_prod) {
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'", // Allow inline styles for CSS-in-JS
        "img-src 'self' https: data:", // Allow HTTPS images and data URIs
        "font-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
    );
  }

  next();
}

/**
 * Sanitize request body middleware
 * Recursively sanitizes all string values in request body
 */
export function sanitize_body(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitize_object(req.body);
  }
  next();
}

/**
 * Recursively sanitize object values
 * @param {Object} obj
 * @returns {Object}
 */
function sanitize_object(obj) {
  if (Array.isArray(obj)) {
    return obj.map(sanitize_object);
  }

  if (obj && typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      // Sanitize key to prevent prototype pollution
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }
      sanitized[key] = sanitize_object(value);
    }
    return sanitized;
  }

  if (typeof obj === 'string') {
    // Remove null bytes and trim
    return obj.replace(/\0/g, '').trim();
  }

  return obj;
}

/**
 * Prevent prototype pollution
 * Rejects requests with suspicious property names
 */
export function prevent_prototype_pollution(req, res, next) {
  const dangerous_keys = ['__proto__', 'constructor', 'prototype'];

  function check_object(obj, path = '') {
    if (!obj || typeof obj !== 'object') return true;

    for (const key of Object.keys(obj)) {
      if (dangerous_keys.includes(key)) {
        return false;
      }
      if (!check_object(obj[key], `${path}.${key}`)) {
        return false;
      }
    }
    return true;
  }

  if (!check_object(req.body) || !check_object(req.query)) {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'Request contains invalid property names',
    });
  }

  next();
}

/**
 * Request size limiter
 * Prevents DoS via large payloads
 * Note: Also set in express.json() but this catches edge cases
 */
export function request_size_limit(max_size = '1mb') {
  const bytes = parse_size(max_size);

  return (req, res, next) => {
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > bytes) {
        req.destroy();
        return res.status(413).json({
          error: 'Payload too large',
          message: `Request body exceeds ${max_size} limit`,
        });
      }
    });

    next();
  };
}

/**
 * Parse size string to bytes
 * @param {string} size - e.g., '1mb', '500kb'
 * @returns {number}
 */
function parse_size(size) {
  const match = size.match(/^(\d+)(kb|mb|gb)?$/i);
  if (!match) return 1024 * 1024; // Default 1MB

  const value = parseInt(match[1], 10);
  const unit = (match[2] || 'b').toLowerCase();

  switch (unit) {
    case 'gb':
      return value * 1024 * 1024 * 1024;
    case 'mb':
      return value * 1024 * 1024;
    case 'kb':
      return value * 1024;
    default:
      return value;
  }
}

/**
 * SSRF protection for URL inputs
 * Validates that URLs don't point to internal resources
 * @param {string} url
 * @returns {boolean}
 */
export function is_safe_url(url) {
  try {
    const parsed = new URL(url);

    // Only allow HTTP(S)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block internal/private addresses
    const blocked = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '::1',
      '[::1]',
      'metadata.google.internal',
      '169.254.169.254', // AWS metadata
    ];

    if (blocked.includes(hostname)) {
      return false;
    }

    // Block private IP ranges
    if (
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
