/**
 * Cryptographic utilities
 * Uses Node.js native crypto module with scrypt for password hashing
 * All comparisons use timing-safe functions to prevent timing attacks
 */

import { scrypt, randomBytes, timingSafeEqual, createHash } from 'crypto';
import { promisify } from 'util';

const scrypt_async = promisify(scrypt);

// Scrypt parameters - using recommended secure defaults
// N=16384 (2^14), r=8, p=1, derived key length=64 bytes
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 32;

/**
 * Hash a password using scrypt with a random salt
 * @param {string} password - Plain text password
 * @returns {Promise<{hash: string, salt: string}>} - Base64 encoded hash and salt
 */
export async function hash_password(password) {
  // Generate cryptographically random salt
  const salt = randomBytes(SALT_LENGTH);

  // Derive key using scrypt
  const derived_key = await scrypt_async(
    password,
    salt,
    KEY_LENGTH,
    { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }
  );

  return {
    hash: derived_key.toString('base64'),
    salt: salt.toString('base64'),
  };
}

/**
 * Verify a password against a stored hash using timing-safe comparison
 * @param {string} password - Plain text password to verify
 * @param {string} stored_hash - Base64 encoded stored hash
 * @param {string} stored_salt - Base64 encoded stored salt
 * @returns {Promise<boolean>} - True if password matches
 */
export async function verify_password(password, stored_hash, stored_salt) {
  try {
    // Decode stored values
    const salt = Buffer.from(stored_salt, 'base64');
    const expected_hash = Buffer.from(stored_hash, 'base64');

    // Derive key from provided password
    const derived_key = await scrypt_async(
      password,
      salt,
      KEY_LENGTH,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }
    );

    // Timing-safe comparison to prevent timing attacks
    // Both buffers must be same length for timingSafeEqual
    if (derived_key.length !== expected_hash.length) {
      return false;
    }

    return timingSafeEqual(derived_key, expected_hash);
  } catch (err) {
    // Log error but return false to not leak information
    console.error('Password verification error:', err.message);
    return false;
  }
}

/**
 * Generate a cryptographically secure random token
 * @param {number} bytes - Number of random bytes (default 32)
 * @returns {string} - URL-safe base64 encoded token
 */
export function generate_token(bytes = 32) {
  return randomBytes(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Hash a token for storage (don't store raw tokens)
 * Uses SHA-256 which is fast but sufficient for random tokens
 * @param {string} token - Raw token to hash
 * @returns {string} - Hex encoded hash
 */
export function hash_token(token) {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Timing-safe string comparison
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} - True if strings are equal
 */
export function safe_compare(a, b) {
  // Convert to buffers for timingSafeEqual
  const buf_a = Buffer.from(a);
  const buf_b = Buffer.from(b);

  // If lengths differ, still do comparison to prevent timing leak
  // but result will be false
  if (buf_a.length !== buf_b.length) {
    // Compare against itself to maintain constant time
    timingSafeEqual(buf_a, buf_a);
    return false;
  }

  return timingSafeEqual(buf_a, buf_b);
}
