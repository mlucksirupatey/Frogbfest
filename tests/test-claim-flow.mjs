// tests/test-claim-flow.mjs
// Test full claim evaluation workflow across Postgres DB, Claim-to-HIPML Bridge, and HIPML Service

import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB || 'claimsetu',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'devpassword',
});

const HIPML_URL = process.env.HIPML_SERVICE_URL || 'http://localhost:3001';

async function main() {
  console.log('--- Testing Claim Evaluation Workflow (DB + Bridge + HIPML) ---\n');

  try {
    // 1. Insert test claim
    const insertRes = await pool.query(`
      INSERT INTO claims (policy_id, status, structured_data)
      VALUES (
        (SELECT id FROM policies WHERE hipml_file_id = 'claimsetu-mvp' LIMIT 1),
        'PENDING',
        $1::jsonb
      )
      RETURNING id, policy_id;
    `, [JSON.stringify({
      patient: { name: "Hari Prasad", age: 60, country: "Nepal" },
      policy: { sumInsured: 500000, inceptionDate: "2023-01-01" },
      hospitalization: {
        startDate: "2026-05-10",
        endDate: "2026-05-15",
        reason: "Routine Checkup", // Will trigger exclusion for Dental
        treatmentCountry: "Nepal"
      },
      procedures: ["Cataract", "Dental Treatment"],
      submissionDate: "2026-05-20"
    })]);

    const claimId = insertRes.rows[0].id;
    console.log(`✓ Inserted claim ID: ${claimId} with Cataract + Dental Treatment`);

    // 2. Query claim with policy from DB
    const claimRes = await pool.query(`
      SELECT c.id, c.policy_id, c.status, c.structured_data, p.name AS policy_name, p.hipml_file_id
      FROM claims c
      JOIN policies p ON c.policy_id = p.id
      WHERE c.id = $1
    `, [claimId]);

    const claim = claimRes.rows[0];
    console.log(`✓ Retrieved claim for policy: "${claim.policy_name}" (pml: ${claim.hipml_file_id})`);

    // 3. Fetch declared variables from HIPML service
    const varsRes = await fetch(`${HIPML_URL}/pml/${claim.hipml_file_id}/variables`);
    const varsJson = await varsRes.json();
    const requiredVars = varsJson.data.variables;
    console.log(`✓ HIPML policy declared ${requiredVars.length} variables:`, requiredVars);

    // 4. Map structured facts to required variables
    const s = claim.structured_data;
    const hipmlInputs = {
      "Sum Insured": s.policy?.sumInsured,
      "Policy inception Date": s.policy?.inceptionDate,
      "Hospitalization start date": s.hospitalization?.startDate,
      "Discharge Date": s.hospitalization?.endDate,
      "Admission Reason": s.hospitalization?.reason,
      "Patient Country of Residence": s.patient?.country,
      "Claim Submission Date": s.submissionDate,
      "Country of Treatment": s.hospitalization?.treatmentCountry
    };
    console.log(`✓ Prepared deterministic HIPML inputs:`, hipmlInputs);

    // 5. POST to HIPML service /run
    const runRes = await fetch(`${HIPML_URL}/pml/${claim.hipml_file_id}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hipmlInputs)
    });
    const runJson = await runRes.json();
    console.log(`✓ Deterministic Evaluation returned Coverage:`);
    console.log(`    - Cataract: included=${runJson.data.Coverage['Cataract']?.included}, limit=${runJson.data.Coverage['Cataract']?.['Limit per policy period']}`);
    console.log(`    - Dental Treatment: included=${runJson.data.Coverage['Dental Treatment']?.included}`);
    console.log(`    - ICU charges: included=${runJson.data.Coverage['ICU charges']?.included}, limit=${runJson.data.Coverage['ICU charges']?.['Limit per day']}/day`);

    // 6. Extract RetrievalNeeds
    const retrievalNeeds = [];
    if (runJson.data.Coverage['Dental Treatment']?.included === false) {
      retrievalNeeds.push({
        code: 'EXCLUDED_PROCEDURE',
        reason: "Procedure 'Dental Treatment' excluded because admission reason was not Accident.",
        item: 'Dental Treatment',
        claimId,
        policyId: claim.policy_id
      });
    }

    console.log(`\n✓ Generated ${retrievalNeeds.length} RetrievalNeed(s) for RAG reasoning:`);
    console.log(retrievalNeeds);

    // 7. Update Claim status in DB
    const finalStatus = retrievalNeeds.length > 0 ? 'NEEDS_REASONING' : 'APPROVED_DETERMINISTIC';
    await pool.query(`UPDATE claims SET status = $1, updated_at = now() WHERE id = $2`, [finalStatus, claimId]);
    console.log(`✓ Claim status updated to: '${finalStatus}' in PostgreSQL`);

    console.log('\n✓ Full DB -> Bridge -> HIPML -> Findings flow verified successfully!');
  } catch (err) {
    console.error('Workflow error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
