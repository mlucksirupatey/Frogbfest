
# ClaimSetu — RAG Demo Agent Instructions (v2)

## What changed from the previous version of this file — read this first

1. **Language: stay in plain JavaScript (`.mjs`, ES modules) — not TypeScript.** The working prototype is `.mjs`. Migrating to TypeScript mid-demo would spend your limited time on a language port instead of RAG mechanics. Reconsider this only when the main Next.js backend (which is TypeScript) actually imports this logic.
2. **Embedding model and dimension: keep `gemini-embedding-001` at the full 3072 dimensions. Do not switch to `gemini-embedding-2` and do not truncate to 1536.** Verified facts behind this: pgvector's 2,000-dimension ceiling applies only to *building an HNSW/IVFFlat index* on the `vector` type — not to column storage or to exact (non-indexed) nearest-neighbor search, which is what this MVP uses throughout (no HNSW/IVFFlat yet, by design). Separately, `gemini-embedding-001`'s full 3072-dim output is **already normalized by the model** — manual normalization is only required if you truncate to 768/1536, which you're not doing. `gemini-embedding-2` is a real but different, incompatible embedding space; switching would require full re-ingestion for no MVP benefit. **Net effect: the existing embedder.mjs's model choice and dimension were already correct. Don't change them.**
3. **Real bug, confirmed by reading the actual code**: `searchEvidence` accepts a `claimId` parameter but never uses it to restrict the search — it only filters by `documentId`, and `claimId` is used solely for the audit-log insert. Fixed below: retrieval is now scoped by `policy_id` through a join to `documents`, which is also architecturally correct since a policy can have more than one source document.
4. **Schema harmonized with what's actually implemented**, not a divergent flat schema. The real prototype already has a `policies` table (`id`, `hipml_file_id`, ...) and a `documents` table (`policy_id`, `file_hash`, ...) feeding `document_chunks`. Keep that relational structure — don't flatten `policy_id` directly onto `document_chunks`.

If future inspection of the live database shows the `embedding` column was actually created as something other than `vector(3072)` (e.g. it failed and was never migrated), fix *that* — don't let this document override reality. Inspect the schema before changing it, every time.

---

## Mission

Build a minimal, framework-free RAG service in `rag_demo_claim_setu/`. This is a learning/demo implementation that later connects to the Next.js backend. The point is to make the mechanics visible:

```text
text -> chunks -> embeddings -> pgvector -> similarity search
```

Do NOT use: LangChain, LangBase, LlamaIndex, a vector-DB SDK abstraction, or an ORM for the retrieval query.

## MVP boundary

This service is retrieval-only. It does not adjudicate claims and does not produce a final approve/reject decision.

```text
HIPML deterministic result
        |
        v
flagged finding -> query builder -> embedding -> pgvector -> top-k evidence
```

The final LLM reasoning step happens later, in the Next.js backend.

---

## Dependencies
Runtime:
```text
express
pg
dotenv
zod
@google/genai   (or keep the current direct REST call — do not run two embedding implementations side by side)
pdf-parse
```

Dev:
```text
vitest
supertest
```

No `typescript`, no `tsx`, no `@types/*` — this stays plain `.mjs`. No LangChain/LangBase. No ORM for vector retrieval.

## Environment variables
Refere to .env,  it already has many fields and merge if missing.
```env
GEMINI_API_KEY=
EMBEDDING_MODEL=gemini-embedding-001
EMBEDDING_DIMENSIONS=3072
DATABASE_URL=
PORT=4100
TOP_K=3
```

Load these through one config module — do not construct the Gemini request URL at module load time using a possibly-undefined API key (the current `embedder.mjs` does this; fix it to validate config explicitly and fail with a clear error if `GEMINI_API_KEY` is missing).

---

## Directory structure

```text
rag_demo_claim_setu/
├── src/
│   ├── config.mjs
│   ├── db.mjs
│   ├── embedder.mjs
│   ├── pdf_parser.mjs
│   ├── normalize.mjs
│   ├── chunker.mjs
│   ├── query_planner.mjs
│   ├── rag_service.mjs
│   ├── context_builder.mjs
│   └── server.mjs
│
├── scripts/
│   ├── ingest_policy.mjs
│   ├── test_retrieval.mjs
│   └── inspect_chunks.mjs
│
├── tests/
│   ├── chunker.test.mjs
│   ├── query_planner.test.mjs
│   └── retrieval.test.mjs
│
├── data/
│   ├── input/policy.pdf
│   └── golden/retrieval-cases.json
│
├── package.json
├── .env
└── README.md
```

---

## PostgreSQL schema

Inspect the live database first. Create/confirm these if missing ( THESE ARE ALREADY DONE SO DO NOT EXECUTE THE SQL Queries):

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS policies (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    issuer TEXT NOT NULL,
    hipml_file_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
    id BIGSERIAL PRIMARY KEY,
    policy_id BIGINT REFERENCES policies(id),
    doc_type TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    original_filename TEXT,
    mime_type TEXT,
    file_size BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_chunks (
    id BIGSERIAL PRIMARY KEY,
    document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    section_title TEXT,
    subsection_title TEXT,
    clause_ref TEXT,
    page_start INTEGER,
    page_end INTEGER,
    embedding vector(3072),
    metadata JSONB NOT NULL DEFAULT '{}',
    UNIQUE (document_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS rag_runs (
    id BIGSERIAL PRIMARY KEY,
    claim_id BIGINT,
    query TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rag_retrievals (
    id BIGSERIAL PRIMARY KEY,
    rag_run_id BIGINT NOT NULL REFERENCES rag_runs(id) ON DELETE CASCADE,
    chunk_id BIGINT NOT NULL REFERENCES document_chunks(id),
    rank INTEGER NOT NULL,
    distance DOUBLE PRECISION NOT NULL
);
```

Do not add HNSW or IVFFlat yet — exact nearest-neighbor search is correct for this phase, and `vector(3072)` supports it without the indexing ceiling applying. If an index is added later, that's the point at which to migrate to `halfvec(3072)`, not before.

---

## Ingestion pipeline

```text
PDF -> pdf-parse -> raw text -> normalize -> structural chunking -> embed -> upsert document_chunks
```

- Normalize: fix line endings, collapse repeated whitespace, but **never delete legal/financial text** — preserve clause numbering (`4.2`, `4.2.1`, `(a)`) and headings exactly.
- Keep the original PDF out of Postgres — it belongs in MinIO; only extracted text and metadata live here.
- If a PDF extracts empty/garbage text (scanned image), that's an OCR problem, not this service's problem — don't add Tesseract here.

`scripts/ingest_policy.mjs` usage:
```bash
node scripts/ingest_policy.mjs ./data/input/policy.pdf <policy_id>
```
It should: extract text, create/find the `documents` row, chunk, embed, upsert into `document_chunks`, and print a short report (chunk count, embeddings generated, sections found). Stop requiring the three hardcoded clauses in `test_rag.mjs` to be the primary dataset — the real `policy.pdf` should be.

## Structural chunking

Split on document structure first, size second. Recognize `SECTION 4`, `4.2`, `4.2(a)`, `COVERAGE`, `EXCLUSIONS`, `DEFINITIONS`-style markers (adapt the exact patterns once you've looked at the real `policy.pdf`).

Bad: `"Limited to NPR 5,000 per day."`
Better:
```text
Document: ClaimSetu MVP Policy
Section: Hospitalization Benefits
Clause: 3.1
Topic: Room Rent

Normal room and nursing charges are limited to NPR 5,000 per day...
```

Starting size: ~400–800 tokens, ~50–100 token overlap — never split a short clause just to hit that size, never break a table mid-row. For tables, convert to self-contained lines (`Benefit: Normal Room` / `Limit: NPR 5,000 per day` / `Co-pay: 10%`), don't flatten cells into meaningless text, and don't invent missing cells. If exact page numbers aren't recoverable, leave them `null` rather than guessing.

---

## Embeddings

Keep the existing direct REST call in `embedder.mjs`, or switch to `@google/genai` — pick one, not both. Fix the module-load-time URL construction bug (validate config lazily/explicitly, not at import time with a possibly-missing key).

```js
// document chunks: embed as-is at 3072 dims, no normalization needed
// query text: same model, same dimension — never mix a query embedding
// with a different model/dimension than what indexed the chunks
```

Before storing any vector, validate: `Array.isArray(vector)`, every element is a finite number, `vector.length === 3072`.

## Retrieval SQL — corrected to actually scope by policy

```sql
SELECT
    dc.id,
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
ORDER BY dc.embedding <=> $1::vector
LIMIT $3;
```

`searchEvidence` must take `policyId` as a required parameter and use it in this join — not an optional `documentId`/`claimId` that silently does nothing when omitted. `claimId`, when provided, is used only to write the `rag_runs`/`rag_retrievals` audit rows, exactly as before.

Fix the upsert to actually update every field on conflict:
```sql
ON CONFLICT (document_id, chunk_index) DO UPDATE SET
  chunk_text = EXCLUDED.chunk_text,
  section_title = EXCLUDED.section_title,
  subsection_title = EXCLUDED.subsection_title,
  clause_ref = EXCLUDED.clause_ref,
  page_start = EXCLUDED.page_start,
  page_end = EXCLUDED.page_end,
  embedding = EXCLUDED.embedding,
  metadata = EXCLUDED.metadata
```
(the current version omits `subsection_title`, `page_start`, `page_end`.)

---

## Query generation — deterministic, not LLM-generated

The RAG query comes from the HIPML deterministic finding, not from asking an LLM to invent a search string.

```js
function buildQueries(finding) {
  switch (finding.code) {
    case 'WAITING_PERIOD':
      return [
        `waiting period for ${finding.item}`,
        `waiting period for pre-existing conditions relevant to ${finding.item}`,
      ];
    case 'PRE_EXISTING_EXCLUSION':
      return [
        `pre-existing condition exclusion for ${finding.item}`,
        'definition of pre-existing condition',
      ];
    case 'COVERAGE_EXCLUSION':
      return [`coverage or exclusion for ${finding.item}`];
    case 'CLAIM_ADMISSIBILITY':
      return [`claim admissibility conditions for ${finding.item}`];
    case 'SUBLIMIT':
      return [`limit or sub-limit for ${finding.item}`];
    default:
      return [
        `${finding.item}: claim states "${finding.claimFact}". ` +
        `Explain the policy's coverage, exclusion, limit, or conditions relevant to this finding.`,
      ];
  }
}
```

## Endpoints

**`POST /ingest`** — `{ policy_id, source_document, text }` (pre-extracted text; the CLI script handles raw PDFs).

**`POST /query`**:
```json
{
  "policy_id": 1,
  "flagged_items": [
    { "code": "WAITING_PERIOD", "item": "Cataract surgery", "claimFact": "Patient has diabetes; policy age is 18 months" }
  ],
  "top_k": 3
}
```
Returns one result set per flagged item, each chunk carrying `chunkId`, `clauseRef`, `sectionTitle`, `pageStart`/`pageEnd`, `cosineSimilarity`, `chunkText` — all from the database, never invented. No LLM call happens in this service.

## Context builder

`src/context_builder.mjs` — pure formatting, no prose generation. Packages `{ claimFacts, deterministicFindings, evidence[] }` for the Next.js backend to turn into an LLM prompt later.

## Audit logging

Keep `rag_runs` / `rag_retrievals` exactly as already implemented (one `rag_runs` row per search, one `rag_retrievals` row per returned chunk with rank + distance). Don't log raw claim data here — the query text is enough for the audit trail.

---

## Testing strategy

Retrieval correctness first — a convincing LLM answer built on wrong retrieval is still wrong.

1. **Prototype smoke test** — keep the current three hardcoded clauses (cataract waiting period / dental exclusion / room-rent sub-limit) as a fixture. After any refactor, the two existing test queries must still retrieve the expected clause in the top 1–2 results.
2. **Golden set** — after ingesting the real `policy.pdf`, hand-write 10–20 cases in `data/golden/retrieval-cases.json`, each with its expected `clauseRef`. You decide the ground truth by reading the PDF — never let the LLM decide it.
3. **Recall@1 / Recall@3** — for each golden query, check whether the expected clause appears in the top 1 / top 3 results.
4. **Policy isolation (important)** — ingest a second policy with deliberately conflicting numbers (e.g. Policy A room rent = NPR 5,000/day, Policy B = NPR 20,000/day). Querying Policy A must never return a Policy B chunk. This is the test that proves the scoping fix above actually works.
5. **Metadata preservation** — for a known clause, assert `clauseRef`, `pageStart`/`pageEnd`, `sectionTitle`, and `chunkText` all match the source exactly.
6. **Query planner unit tests** — no embedding API calls needed; assert the generated query strings contain the right terms for each finding code.
7. **Negative queries** — ask unrelated questions ("motor insurance premium", "property claim documents"). Record the similarity scores rather than guessing a threshold; only set an abstention cutoff once you've seen the real score separation between relevant and irrelevant queries.
8. **Embedding integrity** — every stored vector: correct dimension (3072), all finite numbers, no NaN.
9. **Re-ingestion idempotency** — run ingestion twice on the same PDF; chunk count and content must not duplicate.

## Development order

```text
1. db connection + schema inspection
2. embedding helper (fix the config-at-load bug)
3. chunker
4. ingestion script
5. exact pgvector retrieval SQL (with the policy_id scoping fix)
6. /query endpoint
7. deterministic query planner
8. tests (1–9 above)
9. Next.js integration (later, separate task)
```

Do not add HNSW, IVFFlat, reranking, hybrid search, query expansion, or LLM-generated queries until the exact-search baseline passes its golden tests.

## Practices to avoid

LangChain or any RAG framework; hiding retrieval behind an ORM; embedding an entire policy as one vector; a global search across every policy; letting the LLM do arithmetic or invent citations; treating vector similarity as legal proof a clause applies; adding an index before a retrieval baseline exists; a similarity threshold chosen without measuring real score distributions; a final approve/reject decision in this service; storing the original PDF in Postgres; a publicly exposed MinIO bucket; running two different embedding implementations side by side; switching embedding models/dimensions without a full re-ingestion.

## Definition of done

```text
real policy.pdf -> structural chunks -> embeddings (gemini-embedding-001, 3072 dims)
  -> pgvector -> deterministic query -> correct top-k source chunks,
  scoped per policy, from both a CLI script and POST /query,
  with golden-set Recall@1/Recall@3 measured and policy isolation proven.
```