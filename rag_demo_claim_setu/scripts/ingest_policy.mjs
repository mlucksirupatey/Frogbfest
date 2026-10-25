// rag_demo_claim_setu/scripts/ingest_policy.mjs
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pool } from '../src/db.mjs';
import { parsePdf } from '../src/pdf_parser.mjs';
import { normalizePolicyText } from '../src/normalize.mjs';
import { chunkPolicyText } from '../src/chunker.mjs';
import { indexDocumentChunk } from '../src/rag_service.mjs';

async function ingestPolicy(pdfPath, policyId) {
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF file not found: ${pdfPath}`);
  }

  const pdfBuffer = fs.readFileSync(pdfPath);
  const fileHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  const fileSize = pdfBuffer.length;
  const originalFilename = path.basename(pdfPath);

  console.log(`Starting ingestion for Policy ID: ${policyId}`);
  console.log(`File: ${originalFilename}`);
  console.log(`Hash: ${fileHash}`);

  // Ensure document row exists
  const storagePath = `claim-docs/${fileHash}.pdf`;
  const docRes = await pool.query(`
    INSERT INTO documents (policy_id, doc_type, file_hash, storage_path, original_filename, mime_type, file_size)
    VALUES ($1, 'policy', $2, $3, $4, 'application/pdf', $5)
    ON CONFLICT (claim_id, file_hash) DO NOTHING
    RETURNING id;
  `, [policyId, fileHash, storagePath, originalFilename, fileSize]).catch(async () => {
    // If conflict constraint doesn't exist like this, or we just want to fetch by hash + policy_id
    const existing = await pool.query(`SELECT id FROM documents WHERE policy_id = $1 AND file_hash = $2`, [policyId, fileHash]);
    if (existing.rows.length > 0) return existing;
    // Fallback insert without constraint
    return pool.query(`
      INSERT INTO documents (policy_id, doc_type, file_hash, storage_path, original_filename, mime_type, file_size)
      VALUES ($1, 'policy', $2, $3, $4, 'application/pdf', $5)
      RETURNING id;
    `, [policyId, fileHash, storagePath, originalFilename, fileSize]);
  });

  const documentId = docRes.rows[0].id;
  console.log(`✓ Document ID: ${documentId}`);

  console.log('Extracting text via PDFParse...');
  const { rawText, totalPages } = await parsePdf(pdfBuffer);
  console.log(`✓ Extracted ${totalPages} pages (${rawText.length} characters)`);

  console.log('Normalizing text...');
  const normalizedText = normalizePolicyText(rawText);

  console.log('Chunking document...');
  const chunks = chunkPolicyText(normalizedText);
  console.log(`✓ Created ${chunks.length} structural chunks`);

  console.log('Generating embeddings and indexing to pgvector...');
  let indexedCount = 0;
  for (const chunk of chunks) {
    process.stdout.write(`  Indexing chunk ${chunk.chunk_index}... `);
    await indexDocumentChunk({
      documentId,
      chunkIndex: chunk.chunk_index,
      chunkText: chunk.chunk_text,
      sectionTitle: chunk.section_title,
      subsectionTitle: chunk.subsection_title,
      clauseRef: chunk.clause_ref,
      pageStart: chunk.page_start,
      pageEnd: chunk.page_end
    });
    console.log('OK');
    indexedCount++;
  }

  console.log(`\n🎉 Ingestion complete! ${indexedCount} chunks indexed for policy_id ${policyId}.`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node scripts/ingest_policy.mjs <pdf_path> <policy_id>');
    process.exit(1);
  }

  try {
    await ingestPolicy(args[0], parseInt(args[1], 10));
  } catch (err) {
    console.error('Error during ingestion:', err);
  } finally {
    await pool.end();
  }
}

main();
