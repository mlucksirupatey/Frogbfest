-- db/005_auth_system.sql
-- ClaimSetu Authentication System Migration
-- Adhering to CLAIMSETU_AUTH_IMPLEMENTATION_PLAN.md

-- 1. Ensure institutions table exists and seed standard insurers
CREATE TABLE IF NOT EXISTS institutions (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Clean up any duplicates before upserting standard IDs
DELETE FROM institutions WHERE (code = 'SALICO_MICRO' OR name = 'salico micro insurance company(synthetic)') AND id != 3;

INSERT INTO institutions (id, name, code)
VALUES 
    (1, 'Shikhar Insurance', 'SHIKHAR'),
    (2, 'SALICO Insurance Limited', 'SALICO'),
    (3, 'salico micro insurance company(synthetic)', 'SALICO_MICRO')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    code = EXCLUDED.code;

-- Reset sequence for institutions
SELECT setval('institutions_id_seq', (SELECT MAX(id) FROM institutions));

-- 2. Create users table
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    password TEXT NOT NULL,   -- plaintext for development/MVP demonstration
    role TEXT NOT NULL CHECK (role IN ('policyholder', 'institutional')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower ON users (LOWER(email));

-- 3. Create policyholder_profile table
CREATE TABLE IF NOT EXISTS policyholder_profile (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    policy_id BIGINT NOT NULL REFERENCES policies(id),
    insurance_provider TEXT NOT NULL CHECK (insurance_provider IN ('salico_micro', 'salico', 'shikhar')),
    pan_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure provider check constraint is updated even if table already existed prior to salico_micro migration
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'policyholder_profile'
    ) THEN
        UPDATE policyholder_profile SET insurance_provider = 'salico_micro' WHERE insurance_provider = 'metlife';
        ALTER TABLE policyholder_profile DROP CONSTRAINT IF EXISTS policyholder_profile_insurance_provider_check;
        ALTER TABLE policyholder_profile ADD CONSTRAINT policyholder_profile_insurance_provider_check CHECK (insurance_provider IN ('salico_micro', 'salico', 'shikhar'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_policyholder_profile_policy_id ON policyholder_profile(policy_id);

-- 4. Create institutional_profile table
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

-- 5. Add claim ownership (policyholder_user_id) to claims table
ALTER TABLE claims 
    ADD COLUMN IF NOT EXISTS policyholder_user_id BIGINT 
    REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_claims_policyholder_user_id ON claims(policyholder_user_id);

-- 6. Seed test users (MVP demonstration)
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

