/**
 * PostgreSQL connection pool
 * Uses pg library with configuration based on environment
 * Dev: local PostgreSQL with standard settings
 * Prod: Neon managed PostgreSQL with SSL
 */

import pg from 'pg';
import { db_config, server_config } from '../config/index.js';

const { Pool } = pg;

/**
 * Create pool with appropriate config for environment
 * Production uses connection string with SSL
 * Development uses individual connection parameters
 */
const pool_config = server_config.is_prod
  ? {
      connectionString: db_config.connection_string,
      ssl: db_config.ssl,
      max: 20, // max connections in pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    }
  : {
      host: db_config.host,
      port: db_config.port,
      user: db_config.user,
      password: db_config.password,
      database: db_config.database,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };

export const pool = new Pool(pool_config);

/**
 * Handle pool errors to prevent unhandled rejections
 */
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

/**
 * Execute a single query with automatic client management
 * @param {string} text - SQL query text with $1, $2 placeholders
 * @param {Array} params - Query parameters (automatically sanitized by pg)
 * @returns {Promise<pg.QueryResult>}
 */
export async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;

  // Log slow queries in development for debugging
  if (!server_config.is_prod && duration > 100) {
    console.log('Slow query:', { text, duration, rows: result.rowCount });
  }

  return result;
}

/**
 * Get a client from the pool for transactions
 * Caller is responsible for releasing the client
 * @returns {Promise<pg.PoolClient>}
 */
export async function get_client() {
  return pool.connect();
}

/**
 * Execute multiple queries in a transaction
 * Automatically handles BEGIN, COMMIT, ROLLBACK
 * @param {Function} callback - Async function receiving client, should return result
 * @returns {Promise<any>} - Result from callback
 */
export async function with_transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Test database connection
 * Call on startup to verify connectivity
 */
export async function test_connection() {
  try {
    const result = await query('SELECT NOW()');
    console.log('Database connected successfully at:', result.rows[0].now);
    return true;
  } catch (err) {
    console.error('Database connection failed:', err.message);
    return false;
  }
}

/**
 * Gracefully close all connections
 * Call on server shutdown
 */
export async function close_pool() {
  await pool.end();
  console.log('Database pool closed');
}
