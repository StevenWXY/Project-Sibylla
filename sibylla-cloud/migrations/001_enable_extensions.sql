-- Migration: Enable PostgreSQL Extensions
-- Description: Enable required extensions for Sibylla
-- Author: AI
-- Date: 2026-03-04

-- ============================================
-- UP Migration
-- ============================================

-- UUID generation (built-in in PostgreSQL 13+)
-- Using gen_random_uuid() which is available by default

-- pgcrypto for additional crypto functions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- pgvector for semantic search embeddings
CREATE EXTENSION IF NOT EXISTS "vector";

-- Add comment for documentation
COMMENT ON EXTENSION "vector" IS 'vector similarity search for semantic search (pgvector)';
