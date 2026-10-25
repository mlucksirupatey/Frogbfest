-- db/004_seed_all_policies.sql
-- Incremental seed script to ensure pgvector, tables, policies, and test claims exist
-- Can be safely run multiple times (idempotent / ON CONFLICT DO NOTHING / UPDATE)

CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Ensure policies table exists
CREATE TABLE IF NOT EXISTS policies (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    issuer TEXT NOT NULL,
    hipml_file_id TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Ensure claims table has all required columns
CREATE TABLE IF NOT EXISTS claims (
    id BIGSERIAL PRIMARY KEY,
    policy_id BIGINT NOT NULL REFERENCES policies(id),
    status TEXT NOT NULL DEFAULT 'PENDING',
    submitted_at TIMESTAMPTZ,
    structured_data JSONB NOT NULL DEFAULT '{}',
    reasoning_result JSONB DEFAULT NULL,
    raw_ocr_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- In case claims table already exists without the reasoning_result column:
ALTER TABLE claims ADD COLUMN IF NOT EXISTS reasoning_result JSONB DEFAULT NULL;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS structured_data JSONB NOT NULL DEFAULT '{}';

-- 3. Upsert all 3 health policies
INSERT INTO policies (name, issuer, hipml_file_id)
VALUES 
    (
        'Shikhar Health Policy', 
        'Shikhar Insurance', 
        'claimsetu-mvp'
    ),
    (
        'SALICOHealth Insurance Policy', 
        'salico(synthetic)', 
        'salico-health-mvp'
    ),
    (
        'salico-micro-health-insurance(Synthetic)', 
        'salico(synthetic)', 
        'salico-micro-health-mvp'
    )
ON CONFLICT (hipml_file_id) 
DO UPDATE SET
    name = EXCLUDED.name,
    issuer = EXCLUDED.issuer;

-- 4. Seed initial baseline claim (ID 1) if not present
INSERT INTO claims (id, policy_id, status, structured_data)
VALUES (1, 1, 'PENDING', '{}')
ON CONFLICT (id) DO NOTHING;

-- 5. Verification output
SELECT id, name, issuer, hipml_file_id, created_at FROM policies ORDER BY id;
