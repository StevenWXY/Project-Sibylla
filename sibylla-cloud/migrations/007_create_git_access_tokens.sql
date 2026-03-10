-- Migration: Create Git Access Tokens Table
-- Description: User access tokens for Git operations
-- Author: AI
-- Date: 2026-03-05

-- ============================================
-- UP Migration
-- ============================================

-- Track user access tokens for Git operations
CREATE TABLE git_access_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Token info
    gitea_token_id INTEGER,
    token_name VARCHAR(100) NOT NULL,
    token_hash VARCHAR(64) NOT NULL,          -- SHA-256 hash for revocation lookup
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX idx_git_access_tokens_user ON git_access_tokens(user_id);
CREATE INDEX idx_git_access_tokens_hash ON git_access_tokens(token_hash) 
    WHERE revoked_at IS NULL;

-- Comments
COMMENT ON TABLE git_access_tokens IS 'User access tokens for Git operations';
COMMENT ON COLUMN git_access_tokens.gitea_token_id IS 'Internal Gitea token ID';
COMMENT ON COLUMN git_access_tokens.token_hash IS 'SHA-256 hash of the token (never store raw)';
COMMENT ON COLUMN git_access_tokens.revoked_at IS 'Timestamp when token was revoked (null if active)';
