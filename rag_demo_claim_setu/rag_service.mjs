// rag_demo_claim_setu/rag_service.mjs
// RAG indexing and similarity retrieval service using pgvector and Gemini embeddings

import pg from 'pg';
import { getGeminiEmbedding } from './embedder.mjs';

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB || 'claimsetu',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'devpassword',
});

/**
 * Format float array as pgvector string representation: '[val1, val2, ...]'
 * @param {number[]} vector 
 * @returns {string}
 */
export function toPgVector(vector) {
  return `[${vector.join(',')}]`;
}

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
      clause_ref = EXCLUDED.clause_ref,
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
 * Retrieve top-K relevant chunks for a natural language query using pgvector cosine distance
 */
export async function searchEvidence(queryText, options = {}) {
  const { limit = 3, documentId = null, claimId = null } = options;
  const embedding = await getGeminiEmbedding(queryText);
  const vectorStr = toPgVector(embedding);

  let filterSql = '';
  const params = [vectorStr, limit];

  if (documentId) {
    params.push(documentId);
    filterSql = `WHERE document_id = $3`;
  }

  const query = `
    SELECT
      id,
      document_id,
      chunk_index,
      chunk_text,
      section_title,
      subsection_title,
      clause_ref,
      page_start,
      page_end,
      1 - (embedding <=> $1::vector) AS cosine_similarity,
      (embedding <=> $1::vector) AS distance
    FROM document_chunks
    ${filterSql}
    ORDER BY embedding <=> $1::vector ASC
    LIMIT $2;
  `;

  const res = await pool.query(query, params);

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
        [runId, row.id, i + 1, row.distance]
      );
    }
  }

  return res.rows;
}
