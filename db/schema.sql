-- ClaimSetu MVP PostgreSQL Schema
-- Database: claimsetu
-- Embeddings: Gemini text-embedding-001 (3072 dimensions)

CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Institutions
CREATE TABLE IF NOT EXISTS institutions (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Policies
CREATE TABLE IF NOT EXISTS policies (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    issuer TEXT NOT NULL,
    hipml_file_id TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Users & Auth (Plaintext password for MVP demonstration)
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('policyholder', 'institutional')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower ON users (LOWER(email));

-- 4. Policyholder Profile
CREATE TABLE IF NOT EXISTS policyholder_profile (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    policy_id BIGINT NOT NULL REFERENCES policies(id),
    insurance_provider TEXT NOT NULL CHECK (insurance_provider IN ('salico_micro', 'salico', 'shikhar')),
    pan_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policyholder_profile_policy_id ON policyholder_profile(policy_id);

-- 5. Institutional Profile
CREATE TABLE IF NOT EXISTS institutional_profile (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    institution_id BIGINT NOT NULL REFERENCES institutions(id),
    pan_number TEXT NOT NULL,
    nia_license_number TEXT NOT NULL,
    full_name TEXT,
    employee_id TEXT,
    job_title TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_institutional_profile_institution_id ON institutional_profile(institution_id);

-- 6. Claims
CREATE TABLE IF NOT EXISTS claims (
    id BIGSERIAL PRIMARY KEY,
    policy_id BIGINT NOT NULL
        REFERENCES policies(id),
    policyholder_user_id BIGINT
        REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    submitted_at TIMESTAMPTZ,
    structured_data JSONB NOT NULL DEFAULT '{}',
    reasoning_result JSONB DEFAULT NULL,
    raw_ocr_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claims_policy_id ON claims(policy_id);
CREATE INDEX IF NOT EXISTS idx_claims_policyholder_user_id ON claims(policyholder_user_id);

-- 3. Documents (uploaded files / registry)
CREATE TABLE IF NOT EXISTS documents (
    id BIGSERIAL PRIMARY KEY,
    claim_id BIGINT
        REFERENCES claims(id)
        ON DELETE CASCADE,
    policy_id BIGINT
        REFERENCES policies(id)
        ON DELETE SET NULL,
    doc_type TEXT NOT NULL,
    file_hash CHAR(64) NOT NULL,
    storage_path TEXT NOT NULL,
    original_filename TEXT,
    mime_type TEXT,
    file_size BIGINT,
    extracted_text TEXT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processing_status TEXT NOT NULL DEFAULT 'UPLOADED',
    extracted_data JSONB NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_claim_hash
    ON documents(claim_id, file_hash)
    WHERE claim_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_claim_id
    ON documents(claim_id);

CREATE INDEX IF NOT EXISTS idx_documents_policy_id
    ON documents(policy_id);

CREATE INDEX IF NOT EXISTS idx_documents_file_hash
    ON documents(file_hash);

-- 4. Claim bill line items
CREATE TABLE IF NOT EXISTS claim_bill_items (
    id BIGSERIAL PRIMARY KEY,
    claim_id BIGINT NOT NULL
        REFERENCES claims(id)
        ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity NUMERIC(12,3),
    unit_price NUMERIC(14,2),
    total_amount NUMERIC(14,2) NOT NULL,
    service_code TEXT,
    procedure_code TEXT,
    source_document_id BIGINT
        REFERENCES documents(id)
        ON DELETE SET NULL,
    source_page INTEGER,
    raw_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bill_items_claim_id
    ON claim_bill_items(claim_id);

-- 5. RAG document chunks (Gemini embedding dimensionality = 3072)
CREATE TABLE IF NOT EXISTS document_chunks (
    id BIGSERIAL PRIMARY KEY,
    document_id BIGINT NOT NULL
        REFERENCES documents(id)
        ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    section_title TEXT,
    subsection_title TEXT,
    clause_ref TEXT,
    page_start INTEGER,
    page_end INTEGER,
    embedding vector(3072),
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id
    ON document_chunks(document_id);

-- 6. RAG audit records
CREATE TABLE IF NOT EXISTS rag_runs (
    id BIGSERIAL PRIMARY KEY,
    claim_id BIGINT
        REFERENCES claims(id)
        ON DELETE CASCADE,
    query TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rag_retrievals (
    id BIGSERIAL PRIMARY KEY,
    rag_run_id BIGINT NOT NULL
        REFERENCES rag_runs(id)
        ON DELETE CASCADE,
    chunk_id BIGINT NOT NULL
        REFERENCES document_chunks(id)
        ON DELETE CASCADE,
    rank INTEGER NOT NULL,
    distance DOUBLE PRECISION NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rag_runs_claim_id
    ON rag_runs(claim_id);

CREATE INDEX IF NOT EXISTS idx_rag_retrievals_run_id
    ON rag_retrievals(rag_run_id);

-- 7. Seed initial MVP institutions and policies
INSERT INTO institutions (id, name, code)
VALUES 
    (1, 'Shikhar Insurance', 'SHIKHAR'),
    (2, 'SALICO Insurance Limited', 'SALICO'),
    (3, 'salico micro insurance company(synthetic)', 'SALICO_MICRO')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    code = EXCLUDED.code;

SELECT setval('institutions_id_seq', (SELECT MAX(id) FROM institutions));

INSERT INTO policies (name, issuer, hipml_file_id)
VALUES 
    ('Shikhar Health Policy', 'Shikhar Insurance', 'claimsetu-mvp'),
    ('SALICOHealth Insurance Policy', 'salico(synthetic)', 'salico-health-mvp'),
    ('salico-micro-health-insurance(Synthetic)', 'salico(synthetic)', 'salico-micro-health-mvp')
ON CONFLICT (hipml_file_id) DO NOTHING;

-- 8. Seed initial MVP claim
INSERT INTO claims (id, policy_id, status, structured_data)
VALUES (1, 1, 'PENDING', '{}')
ON CONFLICT (id) DO NOTHING;

-- 9. Seed MVP demo users
INSERT INTO users (id, email, password, role, is_active)
VALUES 
    (1, 'admin@himalayanins.com.np', 'devpassword123', 'institutional', true),
    (2, 'aarav.sharma@nepalmail.np', 'devpassword123', 'policyholder', true)
ON CONFLICT (id) DO UPDATE SET 
    password = EXCLUDED.password, 
    role = EXCLUDED.role;

INSERT INTO institutional_profile (user_id, institution_id, pan_number, nia_license_number, full_name, employee_id, job_title)
VALUES (1, 1, '300184912', 'NIA-LIC-2024-884', 'Rajesh K. Shrestha', 'EMP-8841', 'Head of Claims')
ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name;

INSERT INTO policyholder_profile (user_id, full_name, policy_id, insurance_provider, pan_id)
VALUES (2, 'Aarav Sharma', 1, 'salico_micro', 'PAN-994821')
ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name;

UPDATE claims SET policyholder_user_id = 2 WHERE id = 1 AND policyholder_user_id IS NULL;

SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));
