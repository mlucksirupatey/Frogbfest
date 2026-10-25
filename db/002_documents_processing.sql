-- Migration: Add processing columns to documents table
-- Required by the claims upload pipeline for per-document extraction caching

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'UPLOADED',
  ADD COLUMN IF NOT EXISTS extracted_data JSONB NOT NULL DEFAULT '{}';

-- processing_status lifecycle:
--   UPLOADED -> EXTRACTING -> EXTRACTED -> STRUCTURING -> STRUCTURED -> FAILED

COMMENT ON COLUMN documents.processing_status IS 'Document processing lifecycle: UPLOADED|EXTRACTING|EXTRACTED|STRUCTURING|STRUCTURED|FAILED';
COMMENT ON COLUMN documents.extracted_data IS 'Per-document LLM-extracted structured data (cached to avoid re-extraction on duplicate upload)';
