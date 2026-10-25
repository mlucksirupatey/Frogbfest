-- db/007_enhance_policies.sql
-- Add policy metadata columns and seed diverse policies for Insurer Policy Management

-- 1. Add metadata columns if they don't already exist
ALTER TABLE policies ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Comprehensive Health';
ALTER TABLE policies ADD COLUMN IF NOT EXISTS room_rent_cap TEXT DEFAULT 'NPR 8,000 / Day';
ALTER TABLE policies ADD COLUMN IF NOT EXISTS icu_limit TEXT DEFAULT 'NPR 20,000 / Day';
ALTER TABLE policies ADD COLUMN IF NOT EXISTS co_pay TEXT DEFAULT '10% Patient Co-Pay';
ALTER TABLE policies ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- 2. Update existing core policies with metadata
UPDATE policies 
SET 
  code = 'POL-SHK-781',
  category = 'Executive Comprehensive',
  room_rent_cap = 'NPR 8,000 / Day',
  icu_limit = 'NPR 20,000 / Day',
  co_pay = '5% Patient Co-Pay',
  status = 'active'
WHERE hipml_file_id = 'claimsetu-mvp' AND (code IS NULL OR code = '');

UPDATE policies 
SET 
  code = 'POL-SAL-119',
  category = 'Standard Group Health',
  room_rent_cap = 'NPR 6,000 / Day',
  icu_limit = 'NPR 15,000 / Day',
  co_pay = '10% Patient Co-Pay',
  status = 'active'
WHERE hipml_file_id = 'salico-health-mvp' AND (code IS NULL OR code = '');

UPDATE policies 
SET 
  code = 'POL-SAL-202',
  category = 'Micro Community Grassroots',
  room_rent_cap = 'NPR 3,000 / Day',
  icu_limit = 'NPR 8,000 / Day',
  co_pay = '0% (Fully Subsidized)',
  status = 'active'
WHERE hipml_file_id = 'salico-micro-health-mvp' AND (code IS NULL OR code = '');

-- 3. Upsert additional catalog policies
INSERT INTO policies (name, issuer, hipml_file_id, code, category, room_rent_cap, icu_limit, co_pay, status)
VALUES
  (
    'Corporate Group Health Shield (Gold)',
    'Shikhar Insurance Co. Ltd.',
    'shikhar-corp-gold',
    'POL-992-AX4',
    'Corporate Tier-1 Group',
    'NPR 10,000 / Day',
    'NPR 25,000 / Day',
    '10% Patient Co-Pay',
    'active'
  ),
  (
    'Standard Citizen Health Cover 2079',
    'National Insurance Co.',
    'national-citizen-2079',
    'POL-NIC-302',
    'Retail Citizen Standard',
    'NPR 4,500 / Day',
    'NPR 12,000 / Day',
    '15% Patient Co-Pay',
    'active'
  ),
  (
    'Executive TPA Direct Settlement Underwrite',
    'Nepal Insurance Co.',
    'nepal-ins-tpa-405',
    'POL-NEC-405',
    'TPA Cashless Direct',
    'NPR 12,000 / Day',
    'NPR 30,000 / Day',
    '0% Co-Pay',
    'active'
  ),
  (
    'Specialized Critical Illness Supplemental 2024',
    'Himalayan Everest Insurance',
    'himalayan-critical-884',
    'POL-HIM-884',
    'Critical Illness Rider',
    'NPR 15,000 / Day',
    'NPR 40,000 / Day',
    '0% Rider Exemption',
    'active'
  )
ON CONFLICT (hipml_file_id) DO UPDATE SET
  name = EXCLUDED.name,
  issuer = EXCLUDED.issuer,
  code = EXCLUDED.code,
  category = EXCLUDED.category,
  room_rent_cap = EXCLUDED.room_rent_cap,
  icu_limit = EXCLUDED.icu_limit,
  co_pay = EXCLUDED.co_pay,
  status = EXCLUDED.status;
