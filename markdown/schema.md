# ClaimSetu MVP — PostgreSQL Schema

This schema is deliberately small for the hackathon.

Principles:

- PostgreSQL is the source of truth for structured ClaimSetu data.
- MinIO stores original uploaded files; PostgreSQL stores object metadata/path/hash.
- pgvector stores embeddings for RAG text chunks.
- PostgreSQL stores the HIPML file identifier; the standalone Vitraya HIPML service owns the actual `.pml` file for the MVP.
- Do not add enterprise policy versioning, tenant isolation, or generalized document graphs in the MVP.

## 0. Extensions

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

For the MVP, use ordinary integer IDs (`BIGSERIAL`) consistently.

---

## 1. Policies

One policy product for the demo. `hipml_file_id` is the identifier of the `.pml` file loaded by the standalone HIPML service. Keep the actual `.pml` file in the HIPML service repository for the MVP.

```sql
CREATE TABLE policies (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    issuer TEXT NOT NULL,
    hipml_file_id TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Example:

```text
id: 1
name: Shikhar Health Policy
issuer: Shikhar Insurance
hipml_file_id: claimsetu-mvp
```

---

## 2. Claims

Keep general claim data in JSONB for the MVP. This avoids an oversized schema while still allowing deterministic processing.

```sql
CREATE TABLE claims (
    id BIGSERIAL PRIMARY KEY,

    policy_id BIGINT NOT NULL
        REFERENCES policies(id),

    status TEXT NOT NULL DEFAULT 'PENDING',

    submitted_at TIMESTAMPTZ,

    structured_data JSONB NOT NULL DEFAULT '{}',
    raw_ocr_text TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_claims_policy_id ON claims(policy_id);
```

Recommended `structured_data` shape:

```json
{
  "patient": {
    "name": "...",
    "age": 57
  },
  "policy": {
    "sumInsured": 500000,
    "inceptionDate": "2025-01-01"
  },
  "hospitalization": {
    "startDate": "2026-09-10",
    "endDate": "2026-09-12",
    "reason": "..."
  },
  "diagnoses": [],
  "procedures": [],
  "prescriptions": [],
  "dischargeSummary": {}
}
```

---

## 3. Documents / uploaded files

This is the MVP document registry. A document may belong to a claim; a policy/regulatory source can have `claim_id = NULL`.

SHA-256 is the content identifier for the MinIO object. `UNIQUE (claim_id, file_hash)` prevents the same claim from registering the same bytes twice.

The MinIO object key should be content-addressed, e.g.:

```text
claim-docs/<sha256>
```

```sql
CREATE TABLE documents (
    id BIGSERIAL PRIMARY KEY,

    claim_id BIGINT
        REFERENCES claims(id)
        ON DELETE CASCADE,

    policy_id BIGINT
        REFERENCES policies(id)
        ON DELETE SET NULL,

    doc_type TEXT NOT NULL,

    file_hash CHAR(64) NOT NULL,
    storage_path TEXT NOT NULL,

    original_filename TEXT,
    mime_type TEXT,
    file_size BIGINT,

    extracted_text TEXT,

    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_documents_claim_hash
    ON documents(claim_id, file_hash)
    WHERE claim_id IS NOT NULL;

CREATE INDEX idx_documents_claim_id
    ON documents(claim_id);

CREATE INDEX idx_documents_policy_id
    ON documents(policy_id);

CREATE INDEX idx_documents_file_hash
    ON documents(file_hash);
```

Recommended `doc_type` values for this MVP:

```text
policy
regulation
claim_form
discharge_summary
bill
prescription
diagnostic_report
other
```

Do not use `original_filename` as the storage key.

---

## 4. Claim bill line items

Normalize bill line items because ClaimSetu needs arithmetic and rule comparisons on them.

```sql
CREATE TABLE claim_bill_items (
    id BIGSERIAL PRIMARY KEY,

    claim_id BIGINT NOT NULL
        REFERENCES claims(id)
        ON DELETE CASCADE,

    description TEXT NOT NULL,

    quantity NUMERIC(12,3),
    unit_price NUMERIC(14,2),
    total_amount NUMERIC(14,2) NOT NULL,

    service_code TEXT,
    procedure_code TEXT,

    source_document_id BIGINT
        REFERENCES documents(id)
        ON DELETE SET NULL,

    source_page INTEGER,
    raw_text TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bill_items_claim_id
    ON claim_bill_items(claim_id);
```

---

## 5. RAG document chunks

Only textual evidence that should be searchable belongs here.

For the MVP, this is mainly:

```text
policy text
regulatory/guideline text
```

Claim documents can be added later when semantic search over claim evidence is actually needed.

**Set the vector dimension to match the selected embedding model.** The example below assumes 1536 dimensions.

```sql
CREATE TABLE document_chunks (
    id BIGSERIAL PRIMARY KEY,

    document_id BIGINT NOT NULL
        REFERENCES documents(id)
        ON DELETE CASCADE,

    chunk_index INTEGER NOT NULL,

    chunk_text TEXT NOT NULL,

    section_title TEXT,
    subsection_title TEXT,
    clause_ref TEXT,

    page_start INTEGER,
    page_end INTEGER,

    embedding vector(1536),

    metadata JSONB NOT NULL DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(document_id, chunk_index)
);

CREATE INDEX idx_document_chunks_document_id
    ON document_chunks(document_id);
```

Start with exact nearest-neighbor search; add HNSW only after retrieval quality is working.

Example retrieval:

```sql
SELECT
    id,
    chunk_text,
    clause_ref,
    page_start,
    page_end,
    1 - (embedding <=> $1) AS similarity
FROM document_chunks
WHERE document_id = $2
ORDER BY embedding <=> $1
LIMIT 3;
```

---

## 6. RAG audit records

Keep the MVP RAG trace small but inspectable.

```sql
CREATE TABLE rag_runs (
    id BIGSERIAL PRIMARY KEY,

    claim_id BIGINT
        REFERENCES claims(id)
        ON DELETE CASCADE,

    query TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rag_retrievals (
    id BIGSERIAL PRIMARY KEY,

    rag_run_id BIGINT NOT NULL
        REFERENCES rag_runs(id)
        ON DELETE CASCADE,

    chunk_id BIGINT NOT NULL
        REFERENCES document_chunks(id)
        ON DELETE CASCADE,

    rank INTEGER NOT NULL,
    distance DOUBLE PRECISION NOT NULL
);

CREATE INDEX idx_rag_runs_claim_id
    ON rag_runs(claim_id);

CREATE INDEX idx_rag_retrievals_run_id
    ON rag_retrievals(rag_run_id);
```

---

## 7. Optional existing table change

If the existing `policyholders` table is already part of the backend, simply connect it to the policy product:

```sql
ALTER TABLE policyholders
ADD COLUMN IF NOT EXISTS policy_id BIGINT
REFERENCES policies(id);

CREATE INDEX IF NOT EXISTS idx_policyholders_policy_id
    ON policyholders(policy_id);
```

Do not duplicate policy data inside `policyholders`.

---

## 8. Deliberately excluded from MVP

Do **not** add these yet:

```text
policy_versions
insurer_tenants
policy_rule_nodes
hipml_ast tables
page_image tables
separate vector tables per document type
reranker tables
embedding cache tables
workflow/job tables
complex audit/event sourcing tables
```

The MVP can add these after the core pipeline works.

## Core relationship

```text
policies
   |
   +---- claims
   |       |
   |       +---- documents
   |       +---- claim_bill_items
   |       |
   |       +---- rag_runs
   |               |
   |               +---- rag_retrievals ---- document_chunks ---- documents
   |
   +---- policy/regulatory documents ---- document_chunks
```

## Expected MVP data flow

```text
Original file
  -> MinIO
  -> documents row

Policy PDF/text
  -> hand-authored HIPML
  -> policies.hipml_text
  -> text chunks
  -> embeddings
  -> document_chunks

Claim documents
  -> OCR/extraction
  -> claims.structured_data
  -> claim_bill_items
  -> HIPML variable map
  -> standalone HIPML /run
  -> flagged findings
  -> deterministic RAG query templates
  -> document_chunks retrieval
```
