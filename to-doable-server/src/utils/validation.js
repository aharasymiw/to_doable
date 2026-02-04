/**
 * Input validation and sanitization utilities
 * Used both for request validation and SQL injection prevention
 * All user inputs should pass through these before use
 */

import { password_config, avatar_config } from '../config/index.js';

/**
 * Sanitize string input to prevent XSS
 * Escapes HTML special characters
 * @param {string} input - Raw input string
 * @returns {string} - Sanitized string
 */
export function sanitize_html(input) {
  if (typeof input !== 'string') {
    return '';
  }

  const html_entities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;',
  };

  return input.replace(/[&<>"'`=/]/g, (char) => html_entities[char]);
}

/**
 * Trim and normalize whitespace in string
 * @param {string} input - Raw input
 * @returns {string} - Trimmed string with normalized whitespace
 */
export function normalize_string(input) {
  if (typeof input !== 'string') {
    return '';
  }
  return input.trim().replace(/\s+/g, ' ');
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {{valid: boolean, error?: string}}
 */
export function validate_email(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }

  const trimmed = email.trim().toLowerCase();

  if (trimmed.length > 255) {
    return { valid: false, error: 'Email must be 255 characters or less' };
  }

  // RFC 5322 compliant regex (simplified but robust)
  const email_regex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

  if (!email_regex.test(trimmed)) {
    return { valid: false, error: 'Invalid email format' };
  }

  return { valid: true, value: trimmed };
}

/**
 * Validate username format
 * @param {string} username - Username to validate
 * @returns {{valid: boolean, error?: string, value?: string}}
 */
export function validate_username(username) {
  if (!username || typeof username !== 'string') {
    return { valid: false, error: 'Username is required' };
  }

  const trimmed = username.trim();

  if (trimmed.length < 3) {
    return { valid: false, error: 'Username must be at least 3 characters' };
  }

  if (trimmed.length > 50) {
    return { valid: false, error: 'Username must be 50 characters or less' };
  }

  // Allow alphanumeric, underscore, hyphen
  const username_regex = /^[a-zA-Z0-9_-]+$/;

  if (!username_regex.test(trimmed)) {
    return { valid: false, error: 'Username can only contain letters, numbers, underscores, and hyphens' };
  }

  // Prevent reserved usernames
  const reserved = ['admin', 'administrator', 'root', 'system', 'null', 'undefined'];
  if (reserved.includes(trimmed.toLowerCase()) && trimmed.toLowerCase() !== 'admin') {
    return { valid: false, error: 'This username is reserved' };
  }

  return { valid: true, value: trimmed };
}

/**
 * Validate password meets requirements
 * @param {string} password - Password to validate
 * @returns {{valid: boolean, error?: string}}
 */
export function validate_password(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password is required' };
  }

  if (password.length < password_config.min_length) {
    return { valid: false, error: `Password must be at least ${password_config.min_length} characters` };
  }

  // Max length to prevent DoS via very long passwords
  if (password.length > 1000) {
    return { valid: false, error: 'Password must be 1000 characters or less' };
  }

  return { valid: true };
}

/**
 * Validate phone number in E.164 format
 * @param {string} phone - Phone number to validate
 * @returns {{valid: boolean, error?: string, value?: string}}
 */
export function validate_phone(phone) {
  // Phone is optional, empty is valid
  if (!phone || (typeof phone === 'string' && phone.trim() === '')) {
    return { valid: true, value: null };
  }

  if (typeof phone !== 'string') {
    return { valid: false, error: 'Invalid phone format' };
  }

  const trimmed = phone.trim();

  // E.164 format: + followed by 1-15 digits
  const e164_regex = /^\+[1-9]\d{1,14}$/;

  if (!e164_regex.test(trimmed)) {
    return { valid: false, error: 'Phone must be in E.164 format (e.g., +12025551234)' };
  }

  return { valid: true, value: trimmed };
}

/**
 * Validate bio text
 * @param {string} bio - Bio text to validate
 * @returns {{valid: boolean, error?: string, value?: string}}
 */
export function validate_bio(bio) {
  // Bio is optional
  if (!bio || (typeof bio === 'string' && bio.trim() === '')) {
    return { valid: true, value: null };
  }

  if (typeof bio !== 'string') {
    return { valid: false, error: 'Invalid bio format' };
  }

  const trimmed = bio.trim();

  if (trimmed.length > 500) {
    return { valid: false, error: 'Bio must be 500 characters or less' };
  }

  return { valid: true, value: trimmed };
}

/**
 * Validate pronouns
 * @param {string} pronouns - Pronouns to validate
 * @returns {{valid: boolean, error?: string, value?: string}}
 */
export function validate_pronouns(pronouns) {
  // Pronouns are optional
  if (!pronouns || (typeof pronouns === 'string' && pronouns.trim() === '')) {
    return { valid: true, value: null };
  }

  if (typeof pronouns !== 'string') {
    return { valid: false, error: 'Invalid pronouns format' };
  }

  const trimmed = pronouns.trim();

  if (trimmed.length > 50) {
    return { valid: false, error: 'Pronouns must be 50 characters or less' };
  }

  return { valid: true, value: trimmed };
}

/**
 * Validate avatar URL
 * @param {string} url - URL to validate
 * @returns {{valid: boolean, error?: string, value?: string}}
 */
export function validate_avatar_url(url) {
  // URL is optional
  if (!url || (typeof url === 'string' && url.trim() === '')) {
    return { valid: true, value: null };
  }

  if (typeof url !== 'string') {
    return { valid: false, error: 'Invalid URL format' };
  }

  const trimmed = url.trim();

  // Basic URL validation
  try {
    const parsed = new URL(trimmed);

    // Only allow HTTPS for security
    if (parsed.protocol !== 'https:') {
      return { valid: false, error: 'Avatar URL must use HTTPS' };
    }

    // Prevent SSRF by blocking internal addresses
    const hostname = parsed.hostname.toLowerCase();
    const blocked_patterns = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '::1',
      '10.',
      '172.16.',
      '172.17.',
      '172.18.',
      '172.19.',
      '172.20.',
      '172.21.',
      '172.22.',
      '172.23.',
      '172.24.',
      '172.25.',
      '172.26.',
      '172.27.',
      '172.28.',
      '172.29.',
      '172.30.',
      '172.31.',
      '192.168.',
      'metadata.google',
      '169.254.',
      'metadata.aws',
    ];

    for (const pattern of blocked_patterns) {
      if (hostname.includes(pattern) || hostname.startsWith(pattern)) {
        return { valid: false, error: 'Invalid avatar URL' };
      }
    }

    if (trimmed.length > 2000) {
      return { valid: false, error: 'URL is too long' };
    }

    return { valid: true, value: trimmed };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Validate avatar file for upload
 * @param {Object} file - File object with mimetype, size
 * @returns {{valid: boolean, error?: string}}
 */
export function validate_avatar_file(file) {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  if (!avatar_config.allowed_types.includes(file.mimetype)) {
    return {
      valid: false,
      error: `File type not allowed. Allowed types: ${avatar_config.allowed_extensions.join(', ')}`,
    };
  }

  if (file.size > avatar_config.max_file_size) {
    return {
      valid: false,
      error: `File too large. Maximum size: ${avatar_config.max_file_size / (1024 * 1024)}MB`,
    };
  }

  return { valid: true };
}

/**
 * Validate UUID format
 * @param {string} uuid - UUID string to validate
 * @returns {{valid: boolean, error?: string, value?: string}}
 */
export function validate_uuid(uuid) {
  if (!uuid || typeof uuid !== 'string') {
    return { valid: false, error: 'Invalid ID format' };
  }

  const uuid_regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuid_regex.test(uuid)) {
    return { valid: false, error: 'Invalid ID format' };
  }

  return { valid: true, value: uuid.toLowerCase() };
}

/**
 * Validate idempotency key
 * @param {string} key - Idempotency key to validate
 * @returns {{valid: boolean, error?: string, value?: string}}
 */
export function validate_idempotency_key(key) {
  if (!key || typeof key !== 'string') {
    return { valid: false, error: 'Idempotency key is required' };
  }

  const trimmed = key.trim();

  if (trimmed.length < 8 || trimmed.length > 255) {
    return { valid: false, error: 'Idempotency key must be between 8 and 255 characters' };
  }

  // Only allow URL-safe characters
  const safe_regex = /^[a-zA-Z0-9_-]+$/;

  if (!safe_regex.test(trimmed)) {
    return { valid: false, error: 'Idempotency key contains invalid characters' };
  }

  return { valid: true, value: trimmed };
}

/**
 * Validate pagination parameters
 * @param {any} page - Page number
 * @param {any} limit - Items per page
 * @returns {{valid: boolean, error?: string, page?: number, limit?: number}}
 */
export function validate_pagination(page, limit) {
  const valid_limits = [20, 50, 75, 100, 200, 500, 1000, -1]; // -1 = all

  let parsed_page = parseInt(page, 10) || 1;
  let parsed_limit = parseInt(limit, 10) || 20;

  if (parsed_page < 1) {
    parsed_page = 1;
  }

  if (!valid_limits.includes(parsed_limit)) {
    parsed_limit = 20; // Default to 20 if invalid
  }

  return {
    valid: true,
    page: parsed_page,
    limit: parsed_limit === -1 ? null : parsed_limit,
  };
}

/**
 * Validate and sanitize search query
 * @param {string} query - Search query
 * @returns {{valid: boolean, value?: string}}
 */
export function validate_search_query(query) {
  if (!query || typeof query !== 'string') {
    return { valid: true, value: '' };
  }

  // Remove special SQL characters but keep basic search chars
  const sanitized = query
    .trim()
    .slice(0, 100) // Limit length
    .replace(/[%_\\]/g, ''); // Remove SQL wildcards

  return { valid: true, value: sanitized };
}
