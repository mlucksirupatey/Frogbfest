-- Migration: Add reasoning columns to claims table
-- Stores post-deterministic LLM reasoning, reports, and evidence citations
ALTER TABLE claims
  ADD COLUMN IF NOT EXISTS reasoning_result JSONB DEFAULT NULL;

COMMENT ON COLUMN claims.reasoning_result IS 'Post-deterministic LLM reasoning, structured analysis, operations report, summary, and validated evidence citations';
