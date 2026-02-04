/**
 * In-memory cache service using native Map
 * Persists to PostgreSQL on shutdown and restores on startup
 * Used for rate limiting data and other frequently accessed values
 */

import { query } from '../db/pool.js';

/**
 * Cache entry with value and expiration
 * @typedef {Object} CacheEntry
 * @property {any} value - Cached value
 * @property {number|null} expires_at - Timestamp when entry expires, null = never
 */

/**
 * Simple in-memory cache with TTL support
 */
class MemoryCache {
  constructor() {
    /** @type {Map<string, CacheEntry>} */
    this.store = new Map();

    // Run cleanup every minute to remove expired entries
    this.cleanup_interval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Get value from cache
   * @param {string} key
   * @returns {any|undefined}
   */
  get(key) {
    const entry = this.store.get(key);

    if (!entry) {
      return undefined;
    }

    // Check expiration
    if (entry.expires_at && Date.now() > entry.expires_at) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Set value in cache
   * @param {string} key
   * @param {any} value
   * @param {number|null} ttl_ms - Time to live in milliseconds, null = forever
   */
  set(key, value, ttl_ms = null) {
    const entry = {
      value,
      expires_at: ttl_ms ? Date.now() + ttl_ms : null,
    };
    this.store.set(key, entry);
  }

  /**
   * Delete value from cache
   * @param {string} key
   * @returns {boolean}
   */
  delete(key) {
    return this.store.delete(key);
  }

  /**
   * Check if key exists and is not expired
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return this.get(key) !== undefined;
  }

  /**
   * Clear all entries
   */
  clear() {
    this.store.clear();
  }

  /**
   * Get number of entries
   * @returns {number}
   */
  size() {
    return this.store.size;
  }

  /**
   * Remove expired entries
   */
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.expires_at && now > entry.expires_at) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Stop cleanup interval
   */
  destroy() {
    clearInterval(this.cleanup_interval);
  }

  /**
   * Get all entries for persistence
   * @returns {Object}
   */
  get_all() {
    const data = {};
    for (const [key, entry] of this.store.entries()) {
      // Only persist non-expired entries
      if (!entry.expires_at || Date.now() < entry.expires_at) {
        data[key] = entry;
      }
    }
    return data;
  }

  /**
   * Load entries from persisted data
   * @param {Object} data
   */
  load_all(data) {
    for (const [key, entry] of Object.entries(data)) {
      // Only load non-expired entries
      if (!entry.expires_at || Date.now() < entry.expires_at) {
        this.store.set(key, entry);
      }
    }
  }
}

// Singleton cache instance
export const cache = new MemoryCache();

/**
 * Persist cache to database
 * Called on server shutdown
 */
export async function persist_cache() {
  try {
    const data = cache.get_all();
    const json_data = JSON.stringify(data);

    await query(
      `INSERT INTO cache_persistence (cache_key, cache_value)
       VALUES ('main_cache', $1)
       ON CONFLICT (cache_key) DO UPDATE SET
         cache_value = $1,
         updated_at = NOW()`,
      [json_data]
    );

    console.log(`Cache persisted: ${Object.keys(data).length} entries`);
  } catch (err) {
    console.error('Failed to persist cache:', err.message);
  }
}

/**
 * Restore cache from database
 * Called on server startup
 */
export async function restore_cache() {
  try {
    const result = await query(
      `SELECT cache_value FROM cache_persistence WHERE cache_key = 'main_cache'`
    );

    if (result.rows.length > 0) {
      const data = result.rows[0].cache_value;
      cache.load_all(data);
      console.log(`Cache restored: ${cache.size()} entries`);
    } else {
      console.log('No cached data to restore');
    }
  } catch (err) {
    console.error('Failed to restore cache:', err.message);
  }
}

/**
 * Cache wrapper for async functions
 * Caches the result of the function for the given TTL
 * @param {string} key - Cache key
 * @param {Function} fn - Async function to cache
 * @param {number} ttl_ms - Time to live in milliseconds
 * @returns {Promise<any>}
 */
export async function cached(key, fn, ttl_ms = 60000) {
  const cached_value = cache.get(key);
  if (cached_value !== undefined) {
    return cached_value;
  }

  const value = await fn();
  cache.set(key, value, ttl_ms);
  return value;
}
