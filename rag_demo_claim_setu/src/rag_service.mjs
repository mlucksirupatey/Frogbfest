// rag_demo_claim_setu/src/rag_service.mjs
import { pool, toPgVector } from './db.mjs';
import { getGeminiEmbedding } from './embedder.mjs';

/**
 * Insert or update a document chunk with its 3072-dim embedding
 */
export async function indexDocumentChunk({
  documentId,
  chunkIndex,
  chunkText,
  sectionTitle = null,
  subsectionTitle = null,
  clauseRef = null,
  pageStart = null,
  pageEnd = null,
  metadata = {}
}) {
  const embedding = await getGeminiEmbedding(chunkText);
  const vectorStr = toPgVector(embedding);

  const query = `
    INSERT INTO document_chunks (
      document_id, chunk_index, chunk_text, section_title, subsection_title,
      clause_ref, page_start, page_end, embedding, metadata
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector, $10)
    ON CONFLICT (document_id, chunk_index)
    DO UPDATE SET
      chunk_text = EXCLUDED.chunk_text,
      section_title = EXCLUDED.section_title,
      subsection_title = EXCLUDED.subsection_title,
      clause_ref = EXCLUDED.clause_ref,
      page_start = EXCLUDED.page_start,
      page_end = EXCLUDED.page_end,
      embedding = EXCLUDED.embedding,
      metadata = EXCLUDED.metadata
    RETURNING id;
  `;

  const res = await pool.query(query, [
    documentId,
    chunkIndex,
    chunkText,
    sectionTitle,
    subsectionTitle,
    clauseRef,
    pageStart,
    pageEnd,
    vectorStr,
    JSON.stringify(metadata)
  ]);

  return res.rows[0].id;
}

/**
 * Retrieve top-K relevant chunks for a natural language query using pgvector cosine distance,
 * strictly scoped to the specified policyId to prevent cross-policy data leakage.
 */
export async function searchEvidence(queryText, options = {}) {
  const { policyId, limit = 3, claimId = null } = options;

  if (!policyId) {
    throw new Error('policyId is required to execute a scoped search');
  }

  const embedding = await getGeminiEmbedding(queryText);
  const vectorStr = toPgVector(embedding);

  const query = `
    SELECT
        dc.id AS chunk_id,
        dc.document_id,
        dc.chunk_index,
        dc.chunk_text,
        dc.section_title,
        dc.subsection_title,
        dc.clause_ref,
        dc.page_start,
        dc.page_end,
        1 - (dc.embedding <=> $1::vector) AS cosine_similarity,
        dc.embedding <=> $1::vector AS distance
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    WHERE d.policy_id = $2
    ORDER BY dc.embedding <=> $1::vector ASC
    LIMIT $3;
  `;

  const res = await pool.query(query, [vectorStr, policyId, limit]);

  // Optional audit record if claimId is provided
  if (claimId) {
    const runRes = await pool.query(
      `INSERT INTO rag_runs (claim_id, query) VALUES ($1, $2) RETURNING id`,
      [claimId, queryText]
    );
    const runId = runRes.rows[0].id;
    for (let i = 0; i < res.rows.length; i++) {
      const row = res.rows[i];
      await pool.query(
        `INSERT INTO rag_retrievals (rag_run_id, chunk_id, rank, distance) VALUES ($1, $2, $3, $4)`,
        [runId, row.chunk_id, i + 1, row.distance]
      );
    }
  }

  return res.rows;
}

export default { indexDocumentChunk, searchEvidence };
