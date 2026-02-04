/**
 * Central configuration module
 * Loads environment variables and provides typed config objects
 * Validates required env vars on startup to fail fast
 */

const environment = process.env.ENVIRONMENT || 'dev';
const is_prod = environment === 'PROD';

/**
 * Server configuration
 */
export const server_config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  client_url: process.env.CLIENT_URL || 'http://localhost:5173',
  environment,
  is_prod,
};

/**
 * JWT configuration
 */
export const jwt_config = {
  secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  access_expiry: process.env.JWT_ACCESS_EXPIRY || '15m',
  refresh_expiry: process.env.JWT_REFRESH_EXPIRY || '7d',
};

/**
 * PostgreSQL configuration
 * In dev: uses local defaults
 * In prod: uses Neon connection string with SSL
 */
export const db_config = is_prod
  ? {
      connection_string: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    }
  : {
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT, 10) || 5432,
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'postgres',
      database: process.env.PGDATABASE || 'todoable',
    };

/**
 * AWS SES configuration for email
 */
export const ses_config = {
  region: process.env.AWS_SES_REGION || 'us-east-1',
  credentials: {
    access_key_id: process.env.AWS_SES_ACCESS_KEY_ID,
    secret_access_key: process.env.AWS_SES_SECRET_ACCESS_KEY,
  },
  from_email: process.env.SES_FROM_EMAIL || 'noreply@to-doable.com',
};

/**
 * AWS S3 configuration for avatar storage
 */
export const s3_config = {
  region: process.env.AWS_S3_REGION || 'us-east-1',
  credentials: {
    access_key_id: process.env.AWS_S3_ACCESS_KEY_ID,
    secret_access_key: process.env.AWS_S3_SECRET_ACCESS_KEY,
  },
  bucket: (process.env.AWS_S3_BUCKET + '-' + process.env.ENVIRONMENT).toLowerCase() || 'to-doable-avatars',
};

/**
 * Rate limiting configuration
 */
export const rate_limit_config = {
  registration: {
    max_per_day: 20,
    block_escalation: [3600, 86400, 604800], // 1hr, 1day, 1week in seconds
  },
  login: {
    // Token bucket for IP-based limiting
    ip: {
      tokens_per_minute: 5,
      bucket_size: 5,
    },
    // Counter + decay for user-based limiting
    user: {
      max_consecutive_failures: 5,
      block_escalation: [300, 900, 1800], // 5m, 15m, 30m in seconds
    },
  },
};

/**
 * Avatar upload configuration
 */
export const avatar_config = {
  max_file_size: 5 * 1024 * 1024, // 5MB
  allowed_types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  allowed_extensions: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
  resize_dimensions: { width: 400, height: 400 },
};

/**
 * Email verification configuration
 */
export const email_config = {
  verification_expiry_hours: 24,
  resend_cooldown_minutes: 5,
};

/**
 * Soft delete configuration
 */
export const soft_delete_config = {
  retention_days: 30,
};

/**
 * Password requirements
 */
export const password_config = {
  min_length: 15,
};

/**
 * Validate required environment variables
 * Call on startup to fail fast if config is invalid
 */
export function validate_config() {
  const errors = [];

  if (is_prod) {
    if (!process.env.DATABASE_URL) {
      errors.push('DATABASE_URL is required in production');
    }
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-secret-change-in-production') {
      errors.push('JWT_SECRET must be set to a secure value in production');
    }
  }

  // AWS credentials are always required for SES/S3
  if (!ses_config.credentials.access_key_id || !ses_config.credentials.secret_access_key) {
    errors.push('AWS SES credentials are required');
  }

  if (!s3_config.credentials.access_key_id || !s3_config.credentials.secret_access_key) {
    errors.push('AWS S3 credentials are required');
  }

  if (errors.length > 0) {
    console.error('Configuration validation failed:');
    errors.forEach((err) => console.error(`  - ${err}`));
    process.exit(1);
  }

  console.log(`Configuration validated successfully (environment: ${environment})`);
}
