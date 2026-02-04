/**
 * Idempotency middleware
 * Prevents duplicate requests by caching responses based on idempotency keys
 * Client must send Idempotency-Key header for supported endpoints
 */

import { query } from '../db/pool.js';
import { validate_idempotency_key } from '../utils/validation.js';

/**
 * Idempotency middleware factory
 * @param {Object} options
 * @param {boolean} options.required - If true, idempotency key is required
 * @returns {Function} Express middleware
 */
export function idempotency(options = {}) {
  const { required = false } = options;

  return async (req, res, next) => {
    const key_header = req.headers['idempotency-key'];

    // If no key provided
    if (!key_header) {
      if (required) {
        return res.status(400).json({
          error: 'Idempotency key required',
          message: 'Please provide an Idempotency-Key header',
        });
      }
      return next();
    }

    // Validate key format
    const validation = validate_idempotency_key(key_header);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid idempotency key',
        message: validation.error,
      });
    }

    const key = validation.value;
    const user_id = req.user?.id || null;
    const endpoint = `${req.method}:${req.originalUrl.split('?')[0]}`;

    try {
      // Check for existing response
      const existing = await query(
        `SELECT response_status, response_body, created_at
         FROM idempotency_keys
         WHERE key = $1 AND (user_id = $2 OR (user_id IS NULL AND $2 IS NULL)) AND endpoint = $3
         AND expires_at > NOW()`,
        [key, user_id, endpoint]
      );

      if (existing.rows.length > 0) {
        const cached = existing.rows[0];

        // Return cached response
        res.setHeader('Idempotent-Replayed', 'true');
        return res.status(cached.response_status).json(cached.response_body);
      }

      // Store original res.json to intercept response
      const original_json = res.json.bind(res);
      let response_captured = false;

      res.json = async (body) => {
        // Only store successful or expected responses (not server errors)
        if (!response_captured && res.statusCode < 500) {
          response_captured = true;

          try {
            await query(
              `INSERT INTO idempotency_keys (key, user_id, endpoint, response_status, response_body, expires_at)
               VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '24 hours')
               ON CONFLICT (key) DO UPDATE SET
                 response_status = $4,
                 response_body = $5,
                 expires_at = NOW() + INTERVAL '24 hours'`,
              [key, user_id, endpoint, res.statusCode, body]
            );
          } catch (err) {
            // Don't fail the request if caching fails
            console.error('Failed to store idempotency response:', err.message);
          }
        }

        return original_json(body);
      };

      next();
    } catch (err) {
      console.error('Idempotency check error:', err);
      // Continue without idempotency on error
      next();
    }
  };
}

/**
 * Clean up expired idempotency keys
 * Called periodically or via cron
 */
export async function cleanup_idempotency_keys() {
  try {
    const result = await query(
      `DELETE FROM idempotency_keys WHERE expires_at < NOW()`
    );
    console.log(`Cleaned up ${result.rowCount} expired idempotency keys`);
  } catch (err) {
    console.error('Idempotency cleanup error:', err);
  }
}
