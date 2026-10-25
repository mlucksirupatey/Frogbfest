// rag_demo_claim_setu/src/server.mjs
import express from 'express';
import { config } from './config.mjs';
import { pool, checkDbConnection } from './db.mjs';
import { parsePdf } from './pdf_parser.mjs';
import { normalizePolicyText } from './normalize.mjs';
import { chunkPolicyText } from './chunker.mjs';
import { indexDocumentChunk, searchEvidence } from './rag_service.mjs';
import { buildQueries } from './query_planner.mjs';

const app = express();
app.use(express.json());

// Basic health check
app.get('/health', async (req, res) => {
  try {
    const dbStatus = await checkDbConnection();
    res.json({ status: 'ok', db: dbStatus });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

// POST /ingest
// Body: { policy_id, source_document_path, text (optional overrides source) }
app.post('/ingest', async (req, res) => {
  const { policy_id, source_document_path, text } = req.body;

  if (!policy_id) return res.status(400).json({ error: 'policy_id is required' });

  try {
    let rawText = text;
    
    if (!rawText) {
      if (!source_document_path) {
        return res.status(400).json({ error: 'Must provide either text or source_document_path' });
      }
      const parsed = await parsePdf(source_document_path);
      rawText = parsed.rawText;
    }

    // 1. Normalize
    const normalizedText = normalizePolicyText(rawText);

    // 2. Chunk
    const chunks = chunkPolicyText(normalizedText);

    // 3. Upsert a dummy document for ingestion if it doesn't exist for the policy
    // In a real flow, the document row is created before ingestion. 
    const docRes = await pool.query(
      `INSERT INTO documents (policy_id, doc_type, file_hash, storage_path)
       VALUES ($1, 'policy', 'demo-hash-' || $1, 'claim-docs/demo-' || $1)
       ON CONFLICT DO NOTHING
       RETURNING id;`,
      [policy_id]
    );
    
    let docId;
    if (docRes.rows.length > 0) {
      docId = docRes.rows[0].id;
    } else {
      const getDoc = await pool.query(`SELECT id FROM documents WHERE policy_id = $1 LIMIT 1`, [policy_id]);
      if (getDoc.rows.length === 0) throw new Error('Could not resolve document_id for policy');
      docId = getDoc.rows[0].id;
    }

    // 4. Index
    const results = [];
    for (const chunk of chunks) {
      const id = await indexDocumentChunk({
        documentId: docId,
        chunkIndex: chunk.chunk_index,
        chunkText: chunk.chunk_text,
        sectionTitle: chunk.section_title,
        subsectionTitle: chunk.subsection_title,
        clauseRef: chunk.clause_ref,
        pageStart: chunk.page_start,
        pageEnd: chunk.page_end
      });
      results.push(id);
    }

    res.json({
      status: 'success',
      chunksIndexed: results.length
    });
  } catch (err) {
    console.error('Ingest error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /query
// Body: { policy_id, flagged_items: [{ code, item, claimFact }], top_k }
app.post('/query', async (req, res) => {
  const { policy_id, flagged_items, top_k = 3 } = req.body;

  if (!policy_id) return res.status(400).json({ error: 'policy_id is required' });
  if (!Array.isArray(flagged_items)) return res.status(400).json({ error: 'flagged_items must be an array' });

  try {
    const responseData = { results: [] };

    for (const item of flagged_items) {
      const queries = buildQueries(item);
      const itemEvidence = [];

      // We run the searches for all generated queries, then combine and deduplicate
      for (const q of queries) {
        const hits = await searchEvidence(q, { policyId: policy_id, limit: top_k });
        hits.forEach(h => {
          if (!itemEvidence.find(e => e.chunk_id === h.chunk_id)) {
            itemEvidence.push({
              query: q,
              chunkId: h.chunk_id,
              clauseRef: h.clause_ref,
              sectionTitle: h.section_title,
              pageStart: h.page_start,
              pageEnd: h.page_end,
              cosineSimilarity: h.cosine_similarity,
              chunkText: h.chunk_text
            });
          }
        });
      }

      // Sort combined evidence by similarity
      itemEvidence.sort((a, b) => b.cosineSimilarity - a.cosineSimilarity);
      // Trim to top_k overall
      const topEvidence = itemEvidence.slice(0, top_k);

      responseData.results.push({
        finding: item,
        evidence: topEvidence
      });
    }

    res.json(responseData);
  } catch (err) {
    console.error('Query error:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = config.PORT;
app.listen(PORT, () => {
  console.log(`RAG Service listening on port ${PORT}`);
});
