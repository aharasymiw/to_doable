/**
 * Database migration script
 * Reads and executes schema.sql to set up database tables
 * Safe to run multiple times due to IF NOT EXISTS clauses
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pool, test_connection, close_pool } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function migrate() {
  console.log('Starting database migration...');

  // Test connection first
  const connected = await test_connection();
  if (!connected) {
    console.error('Cannot proceed with migration - database connection failed');
    process.exit(1);
  }

  try {
    // Read schema file
    const schema_path = join(__dirname, 'schema.sql');
    const schema_sql = readFileSync(schema_path, 'utf8');

    // Execute schema
    await pool.query(schema_sql);
    console.log('Schema migration completed successfully');

    // Verify tables exist
    const tables_result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('Created tables:');
    tables_result.rows.forEach((row) => {
      console.log(`  - ${row.table_name}`);
    });
  } catch (err) {
    console.error('Migration failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await close_pool();
  }
}

migrate();
