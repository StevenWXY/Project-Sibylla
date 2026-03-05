-- Migration: Create Workspace Members Table
-- Description: User membership in workspaces (many-to-many)
-- Author: AI
-- Date: 2026-03-04

-- ============================================
-- UP Migration
-- ============================================

-- Create workspace_members table
CREATE TABLE workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    
    -- Role: admin can manage workspace, editor can edit, viewer can only view
    role VARCHAR(20) NOT NULL DEFAULT 'editor'
        CHECK (role IN ('admin', 'editor', 'viewer')),
    
    -- Timestamps
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint: one user can only join a workspace once
    UNIQUE(user_id, workspace_id)
);

-- Indexes for common queries
CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);
CREATE INDEX idx_workspace_members_workspace ON workspace_members(workspace_id);
CREATE INDEX idx_workspace_members_role ON workspace_members(workspace_id, role);

-- Comments for documentation
COMMENT ON TABLE workspace_members IS 'User membership in workspaces';
COMMENT ON COLUMN workspace_members.user_id IS 'Reference to user';
COMMENT ON COLUMN workspace_members.workspace_id IS 'Reference to workspace';
COMMENT ON COLUMN workspace_members.role IS 'User role: admin (full control), editor (can edit), viewer (read-only)';
COMMENT ON COLUMN workspace_members.joined_at IS 'When the user joined the workspace';
