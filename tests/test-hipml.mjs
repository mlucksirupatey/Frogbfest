// tests/test-hipml.mjs
// Automated verification suite for HIPML service as required by HIPML_AGENT.md

const BASE_URL = process.env.HIPML_SERVICE_URL || 'http://localhost:3001';

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, options);
  const json = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, json };
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log(`\n========================================`);
  console.log(`Running HIPML Test Suite on ${BASE_URL}`);
  console.log(`========================================\n`);

  // --- Test 1: Baseline parser (Vitraya ABC123DEF456) ---
  console.log(`Test 1: Baseline Vitraya Sample Policy (ABC123DEF456)`);
  const t1Vars = await request('/pml/ABC123DEF456/variables');
  assert(t1Vars.ok && t1Vars.json.success === true, 'GET /pml/ABC123DEF456/variables succeeds');
  assert(Array.isArray(t1Vars.json.data.variables), 'Returns variables array');

  const t1Run = await request('/pml/ABC123DEF456/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      "Sum Insured": 500000,
      "Policy inception Date": "2020-01-01",
      "Hospitalization start date": "2023-01-01",
      "Discharge Date": "2023-01-05",
      "Admission Reason": "Illness",
      "Patient Nationality": "Indian",
      "Claim Submission Date": "2023-01-10",
      "Country of Treatment": "India"
    })
  });
  assert(t1Run.ok && t1Run.json.success === true, 'POST /pml/ABC123DEF456/run succeeds');
  assert(t1Run.json.data.Coverage['Cataract']?.included === true, 'Cataract is included');

  // --- Test 2: ClaimSetu MVP syntax check ---
  console.log(`\nTest 2: ClaimSetu MVP Syntax & Variable Discovery (claimsetu-mvp)`);
  const t2Vars = await request('/pml/claimsetu-mvp/variables');
  assert(t2Vars.ok && t2Vars.json.success === true, 'GET /pml/claimsetu-mvp/variables succeeds');
  const vars = t2Vars.json.data.variables;
  assert(vars.includes('Sum Insured'), 'Discovered "Sum Insured" variable');
  assert(vars.includes('Policy inception Date'), 'Discovered "Policy inception Date" variable');
  assert(vars.includes('Hospitalization start date'), 'Discovered "Hospitalization start date" variable');
  assert(vars.includes('Country of Treatment'), 'Discovered "Country of Treatment" variable');

  // --- Test 3: Normal covered case ---
  console.log(`\nTest 3: Normal Covered Case`);
  const t3 = await request('/pml/claimsetu-mvp/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      "Sum Insured": 500000,
      "Policy inception Date": "2023-01-01",
      "Hospitalization start date": "2026-05-10", // > 24 months
      "Discharge Date": "2026-05-15",
      "Admission Reason": "Illness",
      "Patient Country of Residence": "Nepal",
      "Claim Submission Date": "2026-05-20",
      "Country of Treatment": "Nepal"
    })
  });
  assert(t3.json.data.Coverage['Cataract']?.included === true, 'Cataract surgery is covered (>24 months)');
  assert(t3.json.data.Coverage['Cataract']?.['Limit per policy period'] === 40000, 'Cataract limit capped at lower of 25% (125k) and 40,000');
  assert(t3.json.data.Coverage['ICU charges']?.['Limit per day'] === 10000, 'ICU charges limit capped at 10,000/day');
  const pe = t3.json.data.Conditions['Patient Eligibility'];
  assert(pe === true || pe?.condition === true, 'Patient eligibility passes (Nepal)');
  const ca = t3.json.data.Conditions['Claim Admissibility'];
  assert(ca === true || ca?.condition === true, 'Claim admissibility passes');

  // --- Test 4: Excluded case ---
  console.log(`\nTest 4: Excluded Case (Dental without Accident)`);
  const t4 = await request('/pml/claimsetu-mvp/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      "Sum Insured": 500000,
      "Policy inception Date": "2023-01-01",
      "Hospitalization start date": "2026-05-10",
      "Discharge Date": "2026-05-15",
      "Admission Reason": "Routine Checkup", // NOT Accident
      "Patient Country of Residence": "Nepal",
      "Claim Submission Date": "2026-05-20",
      "Country of Treatment": "Nepal"
    })
  });
  assert(t4.json.data.Coverage['Dental Treatment']?.included === false, 'Dental treatment excluded when Admission Reason is not Accident');
  assert(t4.json.data.Coverage['Cosmetic Surgeries']?.included === false, 'Cosmetic surgery unconditionally excluded');

  // --- Test 5: Boundary cases ---
  console.log(`\nTest 5: Boundary Cases (Waiting period & Sum Insured thresholds)`);
  // Sub-test 5a: Waiting period boundary (< 24 months: exactly 6 months)
  const t5a = await request('/pml/claimsetu-mvp/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      "Sum Insured": 500000,
      "Policy inception Date": "2026-01-01",
      "Hospitalization start date": "2026-06-01", // only 5 months!
      "Discharge Date": "2026-06-05",
      "Admission Reason": "Illness",
      "Patient Country of Residence": "Nepal",
      "Claim Submission Date": "2026-06-10",
      "Country of Treatment": "Nepal"
    })
  });
  assert(t5a.json.data.Coverage['Cataract']?.included === false, 'Cataract surgery not included before 24 months waiting period');

  // Sub-test 5b: Lower limit threshold (25% of 100,000 = 25,000 < 40,000)
  const t5b = await request('/pml/claimsetu-mvp/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      "Sum Insured": 100000,
      "Policy inception Date": "2020-01-01",
      "Hospitalization start date": "2026-01-01",
      "Discharge Date": "2026-01-05",
      "Admission Reason": "Illness",
      "Patient Country of Residence": "Nepal",
      "Claim Submission Date": "2026-01-10",
      "Country of Treatment": "Nepal"
    })
  });
  assert(t5b.json.data.Coverage['Cataract']?.['Limit per policy period'] === 25000, 'When 25% of SI (25,000) < 40,000, limit is exactly 25,000');

  // --- Test 6: Missing non-existent PML ---
  console.log(`\nTest 6: Missing PML Identifier Handling`);
  const t6 = await request('/pml/non-existent-policy-999/variables');
  assert(t6.json.success === false, 'Non-existent PML returns success: false');
  assert(t6.json.message?.code === 'vt.pml.001', 'Returns code vt.pml.001 for missing PML');

  // --- Test 7: SALICO Micro Health Insurance (salico-micro-health-mvp) ---
  console.log(`\nTest 7: SALICO Micro Health Insurance (salico-micro-health-mvp)`);
  const t7Vars = await request('/pml/salico-micro-health-mvp/variables');
  assert(t7Vars.ok && t7Vars.json.success === true, 'GET /pml/salico-micro-health-mvp/variables succeeds');
  const mVars = t7Vars.json.data.variables;
  assert(mVars.includes('Hospitalization Sum Insured'), 'Discovered "Hospitalization Sum Insured"');
  assert(mVars.includes('Claim Submission Date'), 'Discovered "Claim Submission Date"');

  const t7Run = await request('/pml/salico-micro-health-mvp/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      "Hospitalization Sum Insured": 500000,
      "Policy inception Date": "2024-01-01",
      "Policy expiry Date": "2025-01-01",
      "Hospitalization start date": "2024-06-10",
      "Discharge Date": "2024-06-14",
      "Claim Submission Date": "2024-06-15",
      "Admission Reason": "Illness",
      "Patient Age": 42
    })
  });
  assert(t7Run.ok && t7Run.json.success === true, 'POST /pml/salico-micro-health-mvp/run succeeds');
  assert(t7Run.json.data.Coverage['Room and Nursing charges']?.['Limit per day'] === 5000, 'Room rent capped at 5000/day');
  assert(t7Run.json.data.Coverage['ICU charges']?.['Limit per day'] === 10000, 'ICU capped at 10000/day');
  assert(t7Run.json.data.Coverage['Cataract Extraction']?.['Limit per claim'] === 100000, 'Cataract capped at 100000');
  assert(t7Run.json.data.Coverage['Cosmetics and Plastic Surgery']?.included === false, 'Cosmetic surgery excluded for illness');
  assert(t7Run.json.data.Conditions['Claim Admissibility']?.condition === true || t7Run.json.data.Conditions['Claim Admissibility'] === true, 'Claim Admissibility passes');

  // Summary
  console.log(`\n========================================`);
  console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
