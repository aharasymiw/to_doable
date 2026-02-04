-- To-Doable Database Schema
-- PostgreSQL 15+

-- Enable UUID extension for generating unique identifiers
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
-- Stores all user accounts including admin
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    password_salt VARCHAR(255) NOT NULL,

    -- Profile fields
    avatar_url TEXT,
    bio TEXT,
    phone VARCHAR(20), -- E.164 format: +1234567890
    pronouns VARCHAR(50),

    -- Role and status
    is_admin BOOLEAN DEFAULT FALSE,
    is_verified BOOLEAN DEFAULT FALSE,

    -- Soft delete support
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by_admin BOOLEAN DEFAULT FALSE, -- true if admin deleted without impersonation

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT username_length CHECK (LENGTH(username) >= 3 AND LENGTH(username) <= 50),
    CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NOT NULL;

-- Email verification tokens
CREATE TABLE IF NOT EXISTS email_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Track resend attempts for cooldown
    last_sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id ON email_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verifications_token ON email_verifications(token);
CREATE INDEX IF NOT EXISTS idx_email_verifications_expires ON email_verifications(expires_at);

-- Refresh tokens for JWT authentication
-- Storing these allows us to revoke sessions
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL, -- Store hash, not plain token
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_session_only BOOLEAN DEFAULT FALSE, -- true = expires on browser close (no "stay logged in")
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Track usage for security auditing
    last_used_at TIMESTAMP WITH TIME ZONE,
    user_agent TEXT,
    ip_address INET
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- Admin impersonation sessions
-- Track when admin is acting as another user
CREATE TABLE IF NOT EXISTS impersonation_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ended_at TIMESTAMP WITH TIME ZONE, -- Set when session is closed

    CONSTRAINT different_users CHECK (admin_id != target_user_id)
);

CREATE INDEX IF NOT EXISTS idx_impersonation_admin ON impersonation_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_target ON impersonation_sessions(target_user_id);

-- Rate limiting: Registration attempts per IP
CREATE TABLE IF NOT EXISTS rate_limit_registration (
    ip_address INET PRIMARY KEY,
    request_count INTEGER DEFAULT 1,
    window_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    blocked_until TIMESTAMP WITH TIME ZONE,
    block_count INTEGER DEFAULT 0, -- Escalation counter
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Rate limiting: Login attempts per IP (token bucket)
CREATE TABLE IF NOT EXISTS rate_limit_login_ip (
    ip_address INET PRIMARY KEY,
    tokens FLOAT DEFAULT 5.0, -- Current token count
    last_refill TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    blocked_until TIMESTAMP WITH TIME ZONE,
    block_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Rate limiting: Login failures per user (counter + decay)
CREATE TABLE IF NOT EXISTS rate_limit_login_user (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    consecutive_failures INTEGER DEFAULT 0,
    last_failure_at TIMESTAMP WITH TIME ZONE,
    blocked_until TIMESTAMP WITH TIME ZONE,
    block_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Idempotency keys for preventing duplicate requests
CREATE TABLE IF NOT EXISTS idempotency_keys (
    key VARCHAR(255) PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    endpoint VARCHAR(255) NOT NULL,
    response_status INTEGER,
    response_body JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_idempotency_user ON idempotency_keys(user_id);

-- In-memory cache persistence
-- Stores serialized cache data for restoration on server restart
CREATE TABLE IF NOT EXISTS cache_persistence (
    cache_key VARCHAR(255) PRIMARY KEY,
    cache_value JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Function to update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables with updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_rate_limit_registration_updated_at ON rate_limit_registration;
CREATE TRIGGER update_rate_limit_registration_updated_at
    BEFORE UPDATE ON rate_limit_registration
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_rate_limit_login_ip_updated_at ON rate_limit_login_ip;
CREATE TRIGGER update_rate_limit_login_ip_updated_at
    BEFORE UPDATE ON rate_limit_login_ip
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_rate_limit_login_user_updated_at ON rate_limit_login_user;
CREATE TRIGGER update_rate_limit_login_user_updated_at
    BEFORE UPDATE ON rate_limit_login_user
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_cache_persistence_updated_at ON cache_persistence;
CREATE TRIGGER update_cache_persistence_updated_at
    BEFORE UPDATE ON cache_persistence
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
