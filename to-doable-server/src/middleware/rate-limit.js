/**
 * Rate limiting middleware
 * Implements multiple strategies for different endpoints:
 * - Registration: Fixed window (20/day per IP)
 * - Login IP: Token bucket (5/min per IP)
 * - Login User: Counter + decay (5 consecutive failures per user)
 *
 * All with exponential backoff block escalation
 */

import { query } from '../db/pool.js';
import { rate_limit_config } from '../config/index.js';
import { cache } from '../services/cache.js';

/**
 * Get client IP from request
 * Handles proxies via X-Forwarded-For
 * @param {Request} req
 * @returns {string}
 */
function get_client_ip(req) {
  // Trust proxy header in production (behind load balancer)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // Take first IP in chain (original client)
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

/**
 * Check if IP is permanently blocked
 * @param {string} ip
 * @param {string} table
 * @returns {Promise<boolean>}
 */
async function is_permanently_blocked(ip, table) {
  const cache_key = `${table}:permanent:${ip}`;
  const cached = cache.get(cache_key);
  if (cached !== undefined) {
    return cached;
  }

  const result = await query(
    `SELECT blocked_until FROM ${table}
     WHERE ip_address = $1 AND blocked_until IS NULL AND block_count >= $2`,
    [ip, 4] // 4 = permanent after 3 escalations
  );

  const is_blocked = result.rows.length > 0;
  cache.set(cache_key, is_blocked, 60000); // Cache for 1 minute
  return is_blocked;
}

/**
 * Check if currently in block period
 * @param {Date|null} blocked_until
 * @returns {boolean}
 */
function is_currently_blocked(blocked_until) {
  if (!blocked_until) return false;
  return new Date(blocked_until) > new Date();
}

/**
 * Get block duration based on escalation count
 * @param {number} block_count
 * @param {number[]} escalation
 * @returns {number|null} - Seconds, or null for permanent
 */
function get_block_duration(block_count, escalation) {
  if (block_count >= escalation.length) {
    return null; // Permanent
  }
  return escalation[block_count];
}

// ============================================
// REGISTRATION RATE LIMITER (Fixed Window)
// ============================================

/**
 * Registration rate limiter middleware
 * 20 requests per IP per day using fixed window
 * Exponential backoff: 1hr -> 1day -> 1week -> permanent
 */
export async function rate_limit_registration(req, res, next) {
  const ip = get_client_ip(req);
  const config = rate_limit_config.registration;

  try {
    // Check for permanent block
    if (await is_permanently_blocked(ip, 'rate_limit_registration')) {
      return res.status(429).json({
        error: 'Too many registration attempts',
        message: 'This IP has been permanently blocked due to excessive registration attempts',
      });
    }

    // Get or create rate limit record
    const result = await query(
      `INSERT INTO rate_limit_registration (ip_address, request_count, window_start)
       VALUES ($1, 1, NOW())
       ON CONFLICT (ip_address) DO UPDATE SET
         request_count = CASE
           WHEN rate_limit_registration.window_start < NOW() - INTERVAL '1 day'
           THEN 1
           ELSE rate_limit_registration.request_count + 1
         END,
         window_start = CASE
           WHEN rate_limit_registration.window_start < NOW() - INTERVAL '1 day'
           THEN NOW()
           ELSE rate_limit_registration.window_start
         END
       RETURNING request_count, window_start, blocked_until, block_count`,
      [ip]
    );

    const record = result.rows[0];

    // Check if currently blocked
    if (is_currently_blocked(record.blocked_until)) {
      const remaining = Math.ceil((new Date(record.blocked_until) - new Date()) / 1000);
      return res.status(429).json({
        error: 'Too many registration attempts',
        message: 'Please try again later',
        retry_after: remaining,
      });
    }

    // Check if exceeded limit
    if (record.request_count > config.max_per_day) {
      const block_duration = get_block_duration(record.block_count, config.block_escalation);

      // Apply block
      if (block_duration === null) {
        // Permanent block
        await query(
          `UPDATE rate_limit_registration
           SET block_count = block_count + 1, blocked_until = NULL
           WHERE ip_address = $1`,
          [ip]
        );
        cache.delete(`rate_limit_registration:permanent:${ip}`);
      } else {
        await query(
          `UPDATE rate_limit_registration
           SET blocked_until = NOW() + INTERVAL '${block_duration} seconds',
               block_count = block_count + 1
           WHERE ip_address = $1`,
          [ip]
        );
      }

      return res.status(429).json({
        error: 'Too many registration attempts',
        message: block_duration === null
          ? 'This IP has been permanently blocked'
          : 'Please try again later',
        retry_after: block_duration,
      });
    }

    next();
  } catch (err) {
    console.error('Registration rate limit error:', err);
    // Don't block on rate limit errors, but log
    next();
  }
}

// ============================================
// LOGIN IP RATE LIMITER (Token Bucket)
// ============================================

/**
 * Login IP rate limiter middleware
 * Token bucket: 5 tokens, refill 5/minute
 * Exponential backoff: 1hr -> 1day -> 1week -> permanent
 */
export async function rate_limit_login_ip(req, res, next) {
  const ip = get_client_ip(req);
  const config = rate_limit_config.login.ip;

  try {
    // Check for permanent block
    if (await is_permanently_blocked(ip, 'rate_limit_login_ip')) {
      return res.status(429).json({
        error: 'Too many login attempts',
        message: 'This IP has been permanently blocked',
      });
    }

    // Calculate token refill
    const result = await query(
      `INSERT INTO rate_limit_login_ip (ip_address, tokens, last_refill)
       VALUES ($1, $2, NOW())
       ON CONFLICT (ip_address) DO UPDATE SET
         tokens = LEAST(
           $2,
           rate_limit_login_ip.tokens +
           (EXTRACT(EPOCH FROM NOW() - rate_limit_login_ip.last_refill) / 60.0) * $2
         ),
         last_refill = NOW()
       RETURNING tokens, blocked_until, block_count`,
      [ip, config.bucket_size]
    );

    const record = result.rows[0];

    // Check if currently blocked
    if (is_currently_blocked(record.blocked_until)) {
      const remaining = Math.ceil((new Date(record.blocked_until) - new Date()) / 1000);
      return res.status(429).json({
        error: 'Too many login attempts',
        message: 'Please try again later',
        retry_after: remaining,
      });
    }

    // Check if we have tokens
    if (record.tokens < 1) {
      const block_duration = get_block_duration(record.block_count, config.block_escalation || rate_limit_config.registration.block_escalation);

      // Apply block
      if (block_duration === null) {
        await query(
          `UPDATE rate_limit_login_ip
           SET block_count = block_count + 1, blocked_until = NULL
           WHERE ip_address = $1`,
          [ip]
        );
        cache.delete(`rate_limit_login_ip:permanent:${ip}`);
      } else {
        await query(
          `UPDATE rate_limit_login_ip
           SET blocked_until = NOW() + INTERVAL '${block_duration} seconds',
               block_count = block_count + 1
           WHERE ip_address = $1`,
          [ip]
        );
      }

      return res.status(429).json({
        error: 'Too many login attempts',
        message: 'Please try again later',
        retry_after: block_duration || undefined,
      });
    }

    // Consume a token
    await query(
      `UPDATE rate_limit_login_ip SET tokens = tokens - 1 WHERE ip_address = $1`,
      [ip]
    );

    next();
  } catch (err) {
    console.error('Login IP rate limit error:', err);
    next();
  }
}

// ============================================
// LOGIN USER RATE LIMITER (Counter + Decay)
// ============================================

/**
 * Record a failed login attempt for a user
 * Called after authentication failure
 * @param {string} user_id
 * @returns {Promise<{blocked: boolean, duration?: number}>}
 */
export async function record_login_failure(user_id) {
  const config = rate_limit_config.login.user;

  try {
    // Get or create record, increment failure count
    // Decay: reset if last failure was more than 30 minutes ago
    const result = await query(
      `INSERT INTO rate_limit_login_user (user_id, consecutive_failures, last_failure_at)
       VALUES ($1, 1, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         consecutive_failures = CASE
           WHEN rate_limit_login_user.last_failure_at < NOW() - INTERVAL '30 minutes'
           THEN 1
           ELSE rate_limit_login_user.consecutive_failures + 1
         END,
         last_failure_at = NOW()
       RETURNING consecutive_failures, blocked_until, block_count`,
      [user_id]
    );

    const record = result.rows[0];

    // Check if exceeded threshold
    if (record.consecutive_failures >= config.max_consecutive_failures) {
      const block_duration = get_block_duration(record.block_count, config.block_escalation);

      // Apply block
      if (block_duration === null) {
        // Permanent block
        await query(
          `UPDATE rate_limit_login_user
           SET blocked_until = NULL, block_count = block_count + 1
           WHERE user_id = $1`,
          [user_id]
        );
        return { blocked: true, permanent: true };
      } else {
        await query(
          `UPDATE rate_limit_login_user
           SET blocked_until = NOW() + INTERVAL '${block_duration} seconds',
               block_count = block_count + 1,
               consecutive_failures = 0
           WHERE user_id = $1`,
          [user_id]
        );
        return { blocked: true, duration: block_duration };
      }
    }

    return { blocked: false };
  } catch (err) {
    console.error('Login user rate limit error:', err);
    return { blocked: false };
  }
}

/**
 * Reset login failures on successful login
 * @param {string} user_id
 */
export async function reset_login_failures(user_id) {
  try {
    await query(
      `UPDATE rate_limit_login_user
       SET consecutive_failures = 0, last_failure_at = NULL
       WHERE user_id = $1`,
      [user_id]
    );
  } catch (err) {
    console.error('Reset login failures error:', err);
  }
}

/**
 * Check if user is blocked from login
 * @param {string} user_id
 * @returns {Promise<{blocked: boolean, until?: Date, permanent?: boolean}>}
 */
export async function check_user_login_block(user_id) {
  try {
    const result = await query(
      `SELECT blocked_until, block_count FROM rate_limit_login_user WHERE user_id = $1`,
      [user_id]
    );

    if (result.rows.length === 0) {
      return { blocked: false };
    }

    const record = result.rows[0];

    // Check for permanent block (block_count >= 4 and blocked_until is null)
    if (record.block_count >= 4 && !record.blocked_until) {
      return { blocked: true, permanent: true };
    }

    // Check temporary block
    if (is_currently_blocked(record.blocked_until)) {
      return { blocked: true, until: new Date(record.blocked_until) };
    }

    return { blocked: false };
  } catch (err) {
    console.error('Check user login block error:', err);
    return { blocked: false };
  }
}
