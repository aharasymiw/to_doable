/**
 * To-Doable Server
 * Main entry point
 *
 * A secure, local-first, mobile-first web application backend
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';

import { server_config, validate_config } from './config/index.js';
import { test_connection, close_pool } from './db/pool.js';
import { persist_cache, restore_cache } from './services/cache.js';
import { start_cleanup_jobs, stop_cleanup_jobs } from './jobs/cleanup.js';
import {
  csrf_protection,
  csrf_token_setter,
  security_headers,
  sanitize_body,
  prevent_prototype_pollution,
} from './middleware/security.js';

// Routes
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import adminRoutes from './routes/admin.js';
import accountRoutes from './routes/account.js';

// Validate configuration on startup
validate_config();

const app = express();

// Trust proxy for correct IP detection behind load balancers
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  // Customize helmet for our needs
  contentSecurityPolicy: server_config.is_prod ? undefined : false, // Disable in dev for easier debugging
  crossOriginEmbedderPolicy: false, // Allow loading external images
}));

// CORS configuration
app.use(cors({
  origin: server_config.client_url,
  credentials: true, // Allow cookies
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Idempotency-Key', 'X-CSRF-Token'],
  exposedHeaders: ['Idempotent-Replayed'],
}));

// Body parsing with size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Cookie parsing
app.use(cookieParser());

// Custom security middleware
app.use(security_headers);
app.use(sanitize_body);
app.use(prevent_prototype_pollution);
app.use(csrf_token_setter);

// CSRF protection for state-changing requests
app.use('/api', (req, res, next) => {
  // Skip CSRF for certain paths
  const csrf_exempt_paths = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/verify-email',
    '/api/auth/refresh',
  ];

  if (csrf_exempt_paths.some(path => req.path.startsWith(path))) {
    return next();
  }

  return csrf_protection(req, res, next);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/account', accountRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  // Don't leak error details in production
  const message = server_config.is_prod ? 'Internal server error' : err.message;

  res.status(err.status || 500).json({ error: message });
});

// Graceful shutdown handler
async function graceful_shutdown(signal) {
  console.log(`\n${signal} received, starting graceful shutdown...`);

  // Stop accepting new requests
  server.close(() => {
    console.log('HTTP server closed');
  });

  try {
    // Stop cleanup jobs
    stop_cleanup_jobs();

    // Persist cache to database
    await persist_cache();

    // Close database connections
    await close_pool();

    console.log('Graceful shutdown complete');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
}

// Start server
let server;

async function start_server() {
  try {
    // Test database connection
    const db_connected = await test_connection();
    if (!db_connected) {
      console.error('Failed to connect to database');
      process.exit(1);
    }

    // Restore cache from database
    await restore_cache();

    // Start cleanup jobs
    start_cleanup_jobs();

    // Start HTTP server
    server = app.listen(server_config.port, () => {
      console.log(`To-Doable server running on port ${server_config.port}`);
      console.log(`Environment: ${server_config.environment}`);
      console.log(`Client URL: ${server_config.client_url}`);
    });

    // Handle shutdown signals
    process.on('SIGTERM', () => graceful_shutdown('SIGTERM'));
    process.on('SIGINT', () => graceful_shutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (err) => {
      console.error('Uncaught exception:', err);
      graceful_shutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled rejection at:', promise, 'reason:', reason);
    });

  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start_server();
