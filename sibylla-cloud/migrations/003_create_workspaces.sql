-- Migration: Create Workspaces Table
-- Description: Team workspaces for collaboration
-- Author: AI
-- Date: 2026-03-04

-- ============================================
-- UP Migration
-- ============================================

-- Create workspaces table
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(10),
    
    -- Git configuration
    git_provider VARCHAR(50) DEFAULT 'sibylla' 
        CHECK (git_provider IN ('sibylla', 'github', 'gitlab')),
    git_remote_url TEXT,
    
    -- AI Settings
    default_model VARCHAR(50) DEFAULT 'claude-3-opus',
    
    -- Sync Settings
    sync_interval INTEGER DEFAULT 30,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_workspaces_created_at ON workspaces(created_at);

-- Trigger for auto-updating updated_at
CREATE TRIGGER update_workspaces_updated_at
    BEFORE UPDATE ON workspaces
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE workspaces IS 'Team workspaces for collaboration';
COMMENT ON COLUMN workspaces.id IS 'Unique workspace identifier (UUID)';
COMMENT ON COLUMN workspaces.name IS 'Workspace display name';
COMMENT ON COLUMN workspaces.description IS 'Workspace description';
COMMENT ON COLUMN workspaces.icon IS 'Emoji icon for workspace';
COMMENT ON COLUMN workspaces.git_provider IS 'Git hosting: sibylla (self-hosted), github, or gitlab';
COMMENT ON COLUMN workspaces.git_remote_url IS 'Git remote repository URL';
COMMENT ON COLUMN workspaces.default_model IS 'Default AI model for this workspace';
COMMENT ON COLUMN workspaces.sync_interval IS 'Auto-sync interval in seconds';
