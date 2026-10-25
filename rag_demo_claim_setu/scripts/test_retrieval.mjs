// rag_demo_claim_setu/scripts/test_retrieval.mjs
import fs from 'fs';
import path from 'path';
import { pool } from '../src/db.mjs';
import { searchEvidence } from '../src/rag_service.mjs';

async function testRetrieval(policyId) {
  console.log(`\n--- Smoke Testing Retrieval for Policy ID: ${policyId} ---`);
  
  const testQueries = [
    'What is the waiting period and coverage limit for cataract surgery?',
    'Are dental treatments or cosmetic surgeries covered under this policy?',
    'What is the sub-limit for normal room and nursing charges?'
  ];

  for (const q of testQueries) {
    console.log(`\nQuery: "${q}"`);
    const results = await searchEvidence(q, { policyId, limit: 3 });
    if (results.length === 0) {
      console.log('  No results found!');
      continue;
    }
    for (const r of results) {
      console.log(`  [Rank] Similarity: ${(r.cosine_similarity * 100).toFixed(2)}% | Clause: ${r.clause_ref || 'N/A'}`);
      console.log(`  Snippet: "${r.chunk_text.slice(0, 100).replace(/\n/g, ' ')}..."`);
    }
  }
}

async function goldenEvaluation(policyId, goldenCasesPath) {
  if (!fs.existsSync(goldenCasesPath)) {
    console.log(`\nNo golden cases found at ${goldenCasesPath}, skipping evaluation.`);
    return;
  }
  
  console.log(`\n--- Running Golden Set Evaluation for Policy ID: ${policyId} ---`);
  const cases = JSON.parse(fs.readFileSync(goldenCasesPath, 'utf8'));
  
  let recall1 = 0;
  let recall3 = 0;
  
  for (const tc of cases) {
    const results = await searchEvidence(tc.query, { policyId, limit: 3 });
    const top1 = results[0];
    const top3 = results.slice(0, 3);
    
    // Evaluate Recall@1
    if (top1 && top1.clause_ref && top1.clause_ref.includes(tc.expectedClause)) {
      recall1++;
    }
    
    // Evaluate Recall@3
    if (top3.some(r => r.clause_ref && r.clause_ref.includes(tc.expectedClause))) {
      recall3++;
    } else {
      console.log(`[MISSED] Query: "${tc.query}"`);
      console.log(`         Expected: ${tc.expectedClause}`);
      console.log(`         Got: ${top3.map(r => r.clause_ref).join(', ')}`);
    }
  }
  
  console.log(`\nEvaluation complete for ${cases.length} queries:`);
  console.log(`  Recall@1: ${((recall1 / cases.length) * 100).toFixed(1)}%`);
  console.log(`  Recall@3: ${((recall3 / cases.length) * 100).toFixed(1)}%`);
}

async function main() {
  const args = process.argv.slice(2);
  const policyId = args[0] ? parseInt(args[0], 10) : 2; // Default to 2 (SALICOHealth MVP)
  
  try {
    await testRetrieval(policyId);
    await goldenEvaluation(policyId, path.resolve('data/golden/retrieval-cases.json'));
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    await pool.end();
  }
}

main();
