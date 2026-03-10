-- Migration: Create Git Repositories Table
-- Description: Tracks Git repositories for workspaces (Gitea integration)
-- Author: AI
-- Date: 2026-03-05

-- ============================================
-- UP Migration
-- ============================================

-- Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create git_repos table for tracking workspace Git repositories
CREATE TABLE git_repos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    
    -- Gitea internal info
    gitea_repo_id INTEGER,
    gitea_owner_name VARCHAR(100) NOT NULL,    -- Gitea organization or user
    gitea_repo_name VARCHAR(100) NOT NULL,     -- Repository name
    
    -- Git URLs
    clone_url_http TEXT NOT NULL,
    clone_url_ssh TEXT,
    
    -- Metadata
    default_branch VARCHAR(100) DEFAULT 'main',
    size_bytes BIGINT DEFAULT 0,
    last_push_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(workspace_id),
    UNIQUE(gitea_owner_name, gitea_repo_name)
);

-- Indexes
CREATE INDEX idx_git_repos_workspace ON git_repos(workspace_id);

-- Trigger for updated_at
CREATE TRIGGER update_git_repos_updated_at
    BEFORE UPDATE ON git_repos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE git_repos IS 'Git repositories for workspaces (Gitea integration)';
COMMENT ON COLUMN git_repos.gitea_repo_id IS 'Internal Gitea repository ID';
COMMENT ON COLUMN git_repos.gitea_owner_name IS 'Gitea organization or user owning the repo';
COMMENT ON COLUMN git_repos.gitea_repo_name IS 'Repository name in Gitea';
COMMENT ON COLUMN git_repos.clone_url_http IS 'HTTP(S) clone URL';
COMMENT ON COLUMN git_repos.clone_url_ssh IS 'SSH clone URL (optional)';
