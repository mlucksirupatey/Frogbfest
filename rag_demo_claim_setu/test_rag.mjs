// rag_demo_claim_setu/test_rag.mjs
// Test script to verify Gemini 3072-dim embeddings + pgvector similarity search

import { pool, indexDocumentChunk, searchEvidence } from './rag_service.mjs';

async function main() {
  console.log('--- Testing RAG with Gemini-Embedding-001 (3072 dims) & pgvector ---');

  try {
    // 1. Ensure a policy document exists
    const docHash = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
    let docRes = await pool.query(
      `SELECT id FROM documents WHERE file_hash = $1`,
      [docHash]
    );

    let docId;
    if (docRes.rows.length === 0) {
      const insRes = await pool.query(`
        INSERT INTO documents (
          policy_id, doc_type, file_hash, storage_path,
          original_filename, mime_type, file_size
        )
        VALUES (
          (SELECT id FROM policies WHERE hipml_file_id = 'claimsetu-mvp' LIMIT 1),
          'policy',
          $1,
          $2,
          'Shikhar_Arogya_Policy_Document.pdf',
          'application/pdf',
          125000
        )
        RETURNING id;
      `, [docHash, `claim-docs/${docHash}`]);
      docId = insRes.rows[0].id;
      console.log(`✓ Registered demo policy document in documents table (id: ${docId})`);
    } else {
      docId = docRes.rows[0].id;
      console.log(`✓ Using existing demo document (id: ${docId})`);
    }

    // 2. Index representative policy clauses with Gemini 3072-dim embeddings
    console.log('\nIndexing 3 policy clauses into document_chunks...');

    const clauses = [
      {
        index: 1,
        sectionTitle: 'Section 4 - Specific Illness Waiting Periods',
        clauseRef: 'Clause 4.2',
        pageStart: 5,
        pageEnd: 5,
        text: 'Clause 4.2: Cataract Surgery Waiting Period. Expenses related to the treatment of Cataract are subject to a mandatory 24-month waiting period from the policy inception date. Maximum coverage limit is 25% of Sum Insured or NPR 40,000, whichever is lower per policy year.'
      },
      {
        index: 2,
        sectionTitle: 'Section 6 - Exclusions',
        clauseRef: 'Clause 6.1',
        pageStart: 8,
        pageEnd: 8,
        text: 'Clause 6.1: Dental and Cosmetic Treatment Exclusions. Dental surgeries, corrective cosmetic surgeries, and aesthetic procedures are strictly excluded from coverage unless arising directly out of accidental bodily injury.'
      },
      {
        index: 3,
        sectionTitle: 'Section 3 - Room Rent and ICU Sub-Limits',
        clauseRef: 'Clause 3.1',
        pageStart: 3,
        pageEnd: 3,
        text: 'Clause 3.1: In-patient Care Sub-Limits. Normal Room and Nursing charges are capped at 2% of the Sum Insured up to NPR 5,000 per day. Intensive Care Unit (ICU) charges are capped at 5% of the Sum Insured up to NPR 10,000 per day.'
      }
    ];

    for (const c of clauses) {
      process.stdout.write(`  Embedding & storing Chunk ${c.index} (${c.clauseRef})... `);
      const chunkId = await indexDocumentChunk({
        documentId: docId,
        chunkIndex: c.index,
        chunkText: c.text,
        sectionTitle: c.sectionTitle,
        clauseRef: c.clauseRef,
        pageStart: c.pageStart,
        pageEnd: c.pageEnd,
      });
      console.log(`Done (id: ${chunkId})`);
    }

    // 3. Test natural language retrieval queries
    const testQueries = [
      'What is the waiting period and coverage limit for cataract surgery?',
      'Are dental treatments or cosmetic surgeries covered under this policy?'
    ];

    console.log('\n--- Running Similarity Searches ---');
    for (const q of testQueries) {
      console.log(`\nQuery: "${q}"`);
      const results = await searchEvidence(q, { limit: 2, documentId: docId });
      for (const r of results) {
        console.log(`  Top Match: [${r.clause_ref}] ${r.section_title}`);
        console.log(`  Similarity: ${(r.cosine_similarity * 100).toFixed(2)}% | Distance: ${Number(r.distance).toFixed(4)}`);
        console.log(`  Snippet: "${r.chunk_text.slice(0, 100)}..."`);
      }
    }

    console.log('\n✓ RAG Service and pgvector 3072-dimension indexing tested successfully!');
  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
