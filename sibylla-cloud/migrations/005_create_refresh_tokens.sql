-- Migration: Create Refresh Tokens Table
-- Description: Stores refresh tokens for JWT authentication
-- Author: AI
-- Date: 2026-03-04

-- ============================================
-- UP Migration
-- ============================================

-- Create refresh_tokens table for managing user sessions
CREATE TABLE refresh_tokens (
    id VARCHAR(32) PRIMARY KEY,              -- nanoid
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL,         -- SHA-256 hash of token
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    revoked_at TIMESTAMP WITH TIME ZONE,
    
    -- Device/client info for session management
    user_agent TEXT,
    ip_address INET
);

-- Indexes for common queries
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at) 
    WHERE revoked_at IS NULL;
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash) 
    WHERE revoked_at IS NULL;

-- Comments for documentation
COMMENT ON TABLE refresh_tokens IS 'Refresh tokens for JWT authentication';
COMMENT ON COLUMN refresh_tokens.id IS 'Unique token ID (nanoid)';
COMMENT ON COLUMN refresh_tokens.user_id IS 'Reference to user';
COMMENT ON COLUMN refresh_tokens.token_hash IS 'SHA-256 hash of the actual token (never store raw)';
COMMENT ON COLUMN refresh_tokens.expires_at IS 'Token expiration timestamp';
COMMENT ON COLUMN refresh_tokens.revoked_at IS 'Timestamp when token was revoked (null if active)';
COMMENT ON COLUMN refresh_tokens.user_agent IS 'Client user agent string';
COMMENT ON COLUMN refresh_tokens.ip_address IS 'Client IP address';
