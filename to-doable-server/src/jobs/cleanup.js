/**
 * Cleanup jobs for expired data
 * Runs on schedule to remove:
 * - Soft-deleted accounts past 30-day retention
 * - Expired refresh tokens
 * - Expired email verifications
 * - Expired idempotency keys
 * - Expired impersonation sessions
 */

import { query } from '../db/pool.js';
import { delete_avatar } from '../services/s3.js';
import { soft_delete_config } from '../config/index.js';

/**
 * Simple cron scheduler
 * Uses setInterval for basic scheduling
 */
class CronScheduler {
  constructor() {
    this.jobs = new Map();
  }

  /**
   * Schedule a job to run at fixed intervals
   * @param {string} name - Job name
   * @param {number} interval_ms - Interval in milliseconds
   * @param {Function} fn - Async function to run
   */
  schedule(name, interval_ms, fn) {
    // Run immediately on first schedule
    this.run_job(name, fn);

    // Then schedule for future runs
    const interval_id = setInterval(() => {
      this.run_job(name, fn);
    }, interval_ms);

    this.jobs.set(name, { interval_id, fn });
    console.log(`Scheduled job: ${name} (every ${interval_ms / 1000}s)`);
  }

  /**
   * Run a job with error handling
   */
  async run_job(name, fn) {
    try {
      console.log(`Running job: ${name}`);
      await fn();
      console.log(`Completed job: ${name}`);
    } catch (err) {
      console.error(`Job ${name} failed:`, err);
    }
  }

  /**
   * Stop all scheduled jobs
   */
  stop_all() {
    for (const [name, { interval_id }] of this.jobs.entries()) {
      clearInterval(interval_id);
      console.log(`Stopped job: ${name}`);
    }
    this.jobs.clear();
  }
}

export const scheduler = new CronScheduler();

/**
 * Hard delete accounts past 30-day retention period
 * Only deletes user-initiated soft deletes
 */
async function cleanup_deleted_accounts() {
  try {
    // Get accounts to delete
    const expired = await query(
      `SELECT id, avatar_url FROM users
       WHERE deleted_at IS NOT NULL
       AND deleted_at < NOW() - INTERVAL '${soft_delete_config.retention_days} days'`
    );

    if (expired.rows.length === 0) {
      return;
    }

    console.log(`Found ${expired.rows.length} accounts to permanently delete`);

    for (const user of expired.rows) {
      try {
        // Delete avatar from S3 if exists
        if (user.avatar_url && user.avatar_url.includes('s3.')) {
          await delete_avatar(user.id);
        }

        // Delete user (cascades to related tables)
        await query(`DELETE FROM users WHERE id = $1`, [user.id]);
        console.log(`Permanently deleted user: ${user.id}`);
      } catch (err) {
        console.error(`Failed to delete user ${user.id}:`, err);
      }
    }
  } catch (err) {
    console.error('Cleanup deleted accounts error:', err);
  }
}

/**
 * Remove expired refresh tokens
 */
async function cleanup_refresh_tokens() {
  try {
    const result = await query(
      `DELETE FROM refresh_tokens WHERE expires_at < NOW()`
    );
    if (result.rowCount > 0) {
      console.log(`Cleaned up ${result.rowCount} expired refresh tokens`);
    }
  } catch (err) {
    console.error('Cleanup refresh tokens error:', err);
  }
}

/**
 * Remove expired email verification records
 */
async function cleanup_email_verifications() {
  try {
    const result = await query(
      `DELETE FROM email_verifications WHERE expires_at < NOW()`
    );
    if (result.rowCount > 0) {
      console.log(`Cleaned up ${result.rowCount} expired email verifications`);
    }
  } catch (err) {
    console.error('Cleanup email verifications error:', err);
  }
}

/**
 * Remove expired idempotency keys
 */
async function cleanup_idempotency_keys() {
  try {
    const result = await query(
      `DELETE FROM idempotency_keys WHERE expires_at < NOW()`
    );
    if (result.rowCount > 0) {
      console.log(`Cleaned up ${result.rowCount} expired idempotency keys`);
    }
  } catch (err) {
    console.error('Cleanup idempotency keys error:', err);
  }
}

/**
 * End expired impersonation sessions
 */
async function cleanup_impersonation_sessions() {
  try {
    const result = await query(
      `UPDATE impersonation_sessions SET ended_at = NOW()
       WHERE ended_at IS NULL AND expires_at < NOW()`
    );
    if (result.rowCount > 0) {
      console.log(`Ended ${result.rowCount} expired impersonation sessions`);
    }
  } catch (err) {
    console.error('Cleanup impersonation sessions error:', err);
  }
}

/**
 * Reset expired rate limit blocks
 * (Temporary blocks that have expired)
 */
async function cleanup_rate_limits() {
  try {
    // Registration rate limits - reset counters for expired windows
    await query(
      `UPDATE rate_limit_registration
       SET request_count = 0, window_start = NOW()
       WHERE window_start < NOW() - INTERVAL '1 day'
       AND blocked_until IS NULL OR blocked_until < NOW()`
    );

    // Login IP rate limits - reset tokens for recovered IPs
    await query(
      `UPDATE rate_limit_login_ip
       SET tokens = 5, blocked_until = NULL
       WHERE blocked_until IS NOT NULL AND blocked_until < NOW()`
    );

    // Login user rate limits - reset failures for recovered users
    await query(
      `UPDATE rate_limit_login_user
       SET consecutive_failures = 0, blocked_until = NULL
       WHERE blocked_until IS NOT NULL AND blocked_until < NOW()`
    );
  } catch (err) {
    console.error('Cleanup rate limits error:', err);
  }
}

/**
 * Run all cleanup tasks
 */
async function run_all_cleanup() {
  await cleanup_deleted_accounts();
  await cleanup_refresh_tokens();
  await cleanup_email_verifications();
  await cleanup_idempotency_keys();
  await cleanup_impersonation_sessions();
  await cleanup_rate_limits();
}

/**
 * Start all cleanup jobs
 */
export function start_cleanup_jobs() {
  // Run account cleanup every hour
  scheduler.schedule('cleanup_accounts', 60 * 60 * 1000, cleanup_deleted_accounts);

  // Run token cleanup every 15 minutes
  scheduler.schedule('cleanup_tokens', 15 * 60 * 1000, cleanup_refresh_tokens);

  // Run verification cleanup every hour
  scheduler.schedule('cleanup_verifications', 60 * 60 * 1000, cleanup_email_verifications);

  // Run idempotency cleanup every hour
  scheduler.schedule('cleanup_idempotency', 60 * 60 * 1000, cleanup_idempotency_keys);

  // Run impersonation cleanup every 15 minutes
  scheduler.schedule('cleanup_impersonation', 15 * 60 * 1000, cleanup_impersonation_sessions);

  // Run rate limit cleanup every 5 minutes
  scheduler.schedule('cleanup_rate_limits', 5 * 60 * 1000, cleanup_rate_limits);
}

/**
 * Stop all cleanup jobs
 */
export function stop_cleanup_jobs() {
  scheduler.stop_all();
}

export { run_all_cleanup };
