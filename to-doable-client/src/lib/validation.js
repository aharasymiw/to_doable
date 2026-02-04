/**
 * Client-side validation utilities
 * Mirrors server-side validation for instant feedback
 */

const PASSWORD_MIN_LENGTH = 15;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * Validate email format
 * @param {string} email
 * @returns {{valid: boolean, error?: string}}
 */
export function validate_email(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }

  const trimmed = email.trim();

  if (trimmed.length > 255) {
    return { valid: false, error: 'Email must be 255 characters or less' };
  }

  const email_regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  if (!email_regex.test(trimmed)) {
    return { valid: false, error: 'Invalid email format' };
  }

  return { valid: true };
}

/**
 * Validate username format
 * @param {string} username
 * @returns {{valid: boolean, error?: string}}
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

  const username_regex = /^[a-zA-Z0-9_-]+$/;

  if (!username_regex.test(trimmed)) {
    return { valid: false, error: 'Username can only contain letters, numbers, underscores, and hyphens' };
  }

  return { valid: true };
}

/**
 * Validate password
 * @param {string} password
 * @returns {{valid: boolean, error?: string}}
 */
export function validate_password(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password is required' };
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` };
  }

  if (password.length > 1000) {
    return { valid: false, error: 'Password must be 1000 characters or less' };
  }

  return { valid: true };
}

/**
 * Validate phone number (E.164 format)
 * @param {string} phone
 * @returns {{valid: boolean, error?: string}}
 */
export function validate_phone(phone) {
  if (!phone || phone.trim() === '') {
    return { valid: true }; // Phone is optional
  }

  const trimmed = phone.trim();
  const e164_regex = /^\+[1-9]\d{1,14}$/;

  if (!e164_regex.test(trimmed)) {
    return { valid: false, error: 'Phone must be in E.164 format (e.g., +12025551234)' };
  }

  return { valid: true };
}

/**
 * Validate bio text
 * @param {string} bio
 * @returns {{valid: boolean, error?: string}}
 */
export function validate_bio(bio) {
  if (!bio || bio.trim() === '') {
    return { valid: true }; // Bio is optional
  }

  if (bio.length > 500) {
    return { valid: false, error: 'Bio must be 500 characters or less' };
  }

  return { valid: true };
}

/**
 * Validate pronouns
 * @param {string} pronouns
 * @returns {{valid: boolean, error?: string}}
 */
export function validate_pronouns(pronouns) {
  if (!pronouns || pronouns.trim() === '') {
    return { valid: true }; // Pronouns are optional
  }

  if (pronouns.length > 50) {
    return { valid: false, error: 'Pronouns must be 50 characters or less' };
  }

  return { valid: true };
}

/**
 * Validate avatar URL
 * @param {string} url
 * @returns {{valid: boolean, error?: string}}
 */
export function validate_avatar_url(url) {
  if (!url || url.trim() === '') {
    return { valid: true }; // URL is optional
  }

  try {
    const parsed = new URL(url.trim());

    if (parsed.protocol !== 'https:') {
      return { valid: false, error: 'Avatar URL must use HTTPS' };
    }

    if (url.length > 2000) {
      return { valid: false, error: 'URL is too long' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Validate avatar file for upload
 * @param {File} file
 * @returns {{valid: boolean, error?: string}}
 */
export function validate_avatar_file(file) {
  if (!file) {
    return { valid: false, error: 'No file selected' };
  }

  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { valid: false, error: 'File type not allowed. Use JPG, PNG, WebP, or GIF' };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB` };
  }

  return { valid: true };
}

/**
 * Validate passwords match
 * @param {string} password
 * @param {string} confirm
 * @returns {{valid: boolean, error?: string}}
 */
export function validate_passwords_match(password, confirm) {
  if (password !== confirm) {
    return { valid: false, error: 'Passwords do not match' };
  }

  return { valid: true };
}

/**
 * Sanitize HTML to prevent XSS
 * @param {string} input
 * @returns {string}
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
  };

  return input.replace(/[&<>"'/]/g, (char) => html_entities[char]);
}
