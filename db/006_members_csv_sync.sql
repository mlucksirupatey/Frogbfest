-- db/006_members_csv_sync.sql
-- Insurer Member Registry, Policyholder Linkage, and Claim Processing Status
-- Adheres strictly to CLAIMSETU_FULL_CLAIM_AUTH_MEMBER_IMPLEMENTATION_PLAN.md

-- 1. Create members table (Insurer CSV Registry)
CREATE TABLE IF NOT EXISTS members (
    id BIGSERIAL PRIMARY KEY,
    member_id TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    policy_id BIGINT NOT NULL
      REFERENCES policies(id)
      ON DELETE RESTRICT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    source TEXT NOT NULL DEFAULT 'insurer_csv',
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_members_policy_id
    ON members(policy_id);

-- 2. Link policyholder_profile to members
ALTER TABLE policyholder_profile
ADD COLUMN IF NOT EXISTS member_id BIGINT
  REFERENCES members(id)
  ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_policyholder_profile_member_id
  ON policyholder_profile(member_id)
  WHERE member_id IS NOT NULL;

-- 3. Add processing_status to claims
ALTER TABLE claims
ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'claims_processing_status_check'
  ) THEN
    ALTER TABLE claims ADD CONSTRAINT claims_processing_status_check
      CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed'));
  END IF;
END $$;

-- 4. Add category to documents
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS category TEXT;

-- 5. Seed the 10 mock members (Section 3 of Implementation Plan)
INSERT INTO members (member_id, full_name, policy_id, is_active, source)
VALUES
    ('MEM-9841-NP', 'Ram Bahadur Thapa', 1, TRUE, 'insurer_csv'),
    ('MEM-7284-NP', 'Bikash Gurung', 1, TRUE, 'insurer_csv'),
    ('MEM-5137-NP', 'Sita Devi Gurung', 2, TRUE, 'insurer_csv'),
    ('MEM-4412-NP', 'Prakash Adhikari', 2, TRUE, 'insurer_csv'),
    ('MEM-6629-NP', 'Anita Shrestha', 1, TRUE, 'insurer_csv'),
    ('MEM-3078-NP', 'Suman Karki', 2, TRUE, 'insurer_csv'),
    ('MEM-8154-NP', 'Nabin Tamang', 1, TRUE, 'insurer_csv'),
    ('MEM-2936-NP', 'Manisha Rai', 2, TRUE, 'insurer_csv'),
    ('MEM-5741-NP', 'Roshan KC', 1, TRUE, 'insurer_csv'),
    ('MEM-9362-NP', 'Sarita Gurung', 2, TRUE, 'insurer_csv')
ON CONFLICT (member_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    policy_id = EXCLUDED.policy_id,
    is_active = TRUE,
    updated_at = NOW();

SELECT setval('members_id_seq', (SELECT MAX(id) FROM members));

-- 6. Seed the 10 demo users linked to members (Section 5 of Implementation Plan)
-- Demo password: '123456'
DO $$
DECLARE
    m RECORD;
    v_user_id BIGINT;
    v_provider TEXT;
    v_email TEXT;
BEGIN
    FOR m IN SELECT id, member_id, full_name, policy_id FROM members ORDER BY id LOOP
        -- Map email from name
        v_email := LOWER(REPLACE(SPLIT_PART(m.full_name, ' ', 1) || '.' || SPLIT_PART(m.full_name, ' ', array_length(string_to_array(m.full_name, ' '), 1)), ' ', '')) || '@example.test';
        v_provider := CASE WHEN m.policy_id = 1 THEN 'shikhar' ELSE 'salico' END;

        -- Upsert user
        INSERT INTO users (email, password, role, is_active)
        VALUES (v_email, '123456', 'policyholder', TRUE)
        ON CONFLICT ((LOWER(email))) DO UPDATE SET password = EXCLUDED.password
        RETURNING id INTO v_user_id;

        -- Upsert policyholder_profile
        INSERT INTO policyholder_profile (user_id, member_id, full_name, policy_id, insurance_provider, pan_id)
        VALUES (v_user_id, m.id, m.full_name, m.policy_id, v_provider, 'PAN-' || SUBSTRING(m.member_id FROM 5 FOR 4))
        ON CONFLICT (user_id) DO UPDATE SET
            member_id = EXCLUDED.member_id,
            full_name = EXCLUDED.full_name,
            policy_id = EXCLUDED.policy_id,
            insurance_provider = EXCLUDED.insurance_provider;
    END LOOP;
END $$;
