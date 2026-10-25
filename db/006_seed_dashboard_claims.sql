-- db/006_seed_dashboard_claims.sql
-- Diverse demonstration claims for ClaimSetu Insurer Dashboard

INSERT INTO claims (id, policy_id, policyholder_user_id, status, submitted_at, structured_data, reasoning_result)
VALUES 
    (
        2, 
        1, 
        2, 
        'AUTO_APPROVED', 
        now() - INTERVAL '1 day',
        '{
            "patient": {"name": "Aarav Sharma", "age": 34},
            "hospitalization": {"hospital_name": "T.U. Teaching Hospital (TUTH)", "admission_date": "2083-05-18", "discharge_date": "2083-05-21"},
            "diagnoses": ["Fracture of Right Femur"],
            "procedures": ["Open Reduction and Internal Fixation (ORIF)"],
            "declared_total": 450000.00
        }',
        '{
            "disposition": "passed",
            "model_metadata": {"confidence": 98},
            "summary_report": "All surgical line items verified against Shikhar In-Patient Schedule. 0 deductible applied under Section 4."
        }'
    ),
    (
        3, 
        2, 
        2, 
        'PENDING', 
        now() - INTERVAL '2 days',
        '{
            "patient": {"name": "Sita Maya Tamang", "age": 52},
            "hospitalization": {"hospital_name": "Bir Hospital (National Trauma Centre)", "admission_date": "2083-05-15", "discharge_date": "2083-05-17"},
            "diagnoses": ["Acute Cholecystitis"],
            "procedures": ["Laparoscopic Cholecystectomy"],
            "declared_total": 85200.00
        }',
        '{
            "disposition": "under_evaluation",
            "model_metadata": {"confidence": 65},
            "summary_report": "Diagnostic ultrasound verified. Waiting for pre-authorization verification match."
        }'
    ),
    (
        4, 
        1, 
        2, 
        'APPROVED', 
        now() - INTERVAL '3 days',
        '{
            "patient": {"name": "Bikram K. KC", "age": 61},
            "hospitalization": {"hospital_name": "Nepal Mediciti Hospital", "admission_date": "2083-05-12", "discharge_date": "2083-05-13"},
            "diagnoses": ["Senile Cataract - Bilateral"],
            "procedures": ["Phacoemulsification with Foldable IOL"],
            "declared_total": 40000.00
        }',
        '{
            "disposition": "passed",
            "model_metadata": {"confidence": 99},
            "summary_report": "Compliant with 24-month waiting period clause 4.2. Covered up to statutory sub-limit NPR 40,000."
        }'
    ),
    (
        5, 
        5, 
        2, 
        'FLAGGED', 
        now() - INTERVAL '4 days',
        '{
            "patient": {"name": "Sunita Maharjan", "age": 29},
            "hospitalization": {"hospital_name": "Patan Hospital", "admission_date": "2083-05-08", "discharge_date": "2083-05-11"},
            "diagnoses": ["Dengue Fever with Severe Thrombocytopenia"],
            "procedures": ["Platelet Transfusion and Supportive Care"],
            "declared_total": 28500.00
        }',
        '{
            "disposition": "failed",
            "model_metadata": {"confidence": 42},
            "summary_report": "Discrepancy detected between pharmacy invoice VAT serial and hospital bill header. Requires auditor check."
        }'
    )
ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    structured_data = EXCLUDED.structured_data,
    reasoning_result = EXCLUDED.reasoning_result,
    submitted_at = EXCLUDED.submitted_at;

-- Reset sequence to prevent ID collisions
SELECT setval('claims_id_seq', (SELECT MAX(id) FROM claims));
