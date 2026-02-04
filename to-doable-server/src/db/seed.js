/**
 * Database seed script
 * Creates initial admin account if it doesn't exist
 * Safe to run multiple times - checks for existing admin
 */

import { pool, test_connection, close_pool } from './pool.js';
import { hash_password } from '../utils/crypto.js';

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin';
const ADMIN_EMAIL = 'admin@to-doable.local';

async function seed() {
  console.log('Starting database seeding...');

  // Test connection first
  const connected = await test_connection();
  if (!connected) {
    console.error('Cannot proceed with seeding - database connection failed');
    process.exit(1);
  }

  try {
    // Check if admin already exists
    const existing = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [ADMIN_USERNAME]
    );

    if (existing.rows.length > 0) {
      console.log('Admin account already exists, skipping seed');
      return;
    }

    // Create admin account with hashed password
    const { hash, salt } = await hash_password(ADMIN_PASSWORD);

    await pool.query(
      `INSERT INTO users (
        username,
        email,
        password_hash,
        password_salt,
        is_admin,
        is_verified,
        bio,
        pronouns
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        ADMIN_USERNAME,
        ADMIN_EMAIL,
        hash,
        salt,
        true, // is_admin
        true, // is_verified (admin doesn't need email verification)
        'System administrator',
        'they/them',
      ]
    );

    console.log('Admin account created successfully');
    console.log(`  Username: ${ADMIN_USERNAME}`);
    console.log(`  Password: ${ADMIN_PASSWORD}`);
    console.log('  ⚠️  Please change this password immediately in production!');
  } catch (err) {
    console.error('Seeding failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await close_pool();
  }
}

seed();
