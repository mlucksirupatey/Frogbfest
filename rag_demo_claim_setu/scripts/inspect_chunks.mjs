// rag_demo_claim_setu/scripts/inspect_chunks.mjs
import { pool } from '../src/db.mjs';

async function inspectChunks(policyId) {
  console.log(`\n--- Inspecting Document Chunks for Policy ID: ${policyId} ---`);
  
  const query = `
    SELECT dc.chunk_index, dc.section_title, dc.clause_ref, length(dc.chunk_text) as text_len, 
           vector_dims(dc.embedding) as vector_dim
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    WHERE d.policy_id = $1
    ORDER BY dc.chunk_index ASC;
  `;
  
  const res = await pool.query(query, [policyId]);
  
  if (res.rows.length === 0) {
    console.log('No chunks found for this policy.');
    return;
  }
  
  console.log(`Total Chunks: ${res.rows.length}\n`);
  console.table(res.rows.map(r => ({
    Index: r.chunk_index,
    Section: r.section_title ? r.section_title.substring(0, 30) + '...' : 'N/A',
    Clause: r.clause_ref || 'N/A',
    TextLen: r.text_len,
    VectorDim: r.vector_dim
  })));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: node scripts/inspect_chunks.mjs <policy_id>');
    process.exit(1);
  }

  try {
    await inspectChunks(parseInt(args[0], 10));
  } catch (err) {
    console.error('Inspect error:', err);
  } finally {
    await pool.end();
  }
}

main();
