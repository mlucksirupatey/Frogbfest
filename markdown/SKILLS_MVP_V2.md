# ClaimSetu — AI Agent Skills & Project Context

## Purpose

ClaimSetu is a hackathon MVP for automated health-insurance claim processing in Nepal.

The system has two distinct reasoning layers:

1. **Deterministic policy evaluation** — uses a structured policy representation based on Vitraya Technologies' HIPML to evaluate rules from the policy against structured claim facts.
2. **Retrieval-Augmented Generation (RAG)** — retrieves relevant original policy/regulatory text and uses an LLM to explain or reason about cases that require semantic/contextual interpretation.

The LLM must NOT replace deterministic rule evaluation, arithmetic, authorization, or source verification.

---

## Core Architecture

```text
                        CLAIMSETU
                            |
                +-----------+-----------+
                |                       |
                v                       v
          CLAIM DOCUMENTS           POLICY
          bill/prescription/          |
          discharge/etc.              +----------------+
                |                     |                |
                v                     v                v
          OCR / extraction         HIPML           Original text
                |                     |                |
                v                     v                v
       Structured Claim JSON     HIPML parser      Chunk + embed
                |                     |                |
                v                     v                v
       Claim-to-HIPML inputs    Deterministic      pgvector
                                  evaluation          |
                |                     |               v
                +----------+----------+----------> Retrieval
                           |                          |
                           v                          v
                     RAG retrieval plan ------> Evidence
                           |                          |
                           +-------------+------------+
                                         v
                                        LLM
                                         |
                                         v
                              Structured explanation
                              + source citations
                                         |
                                         v
                                  Human reviewer
```

### Mental model

- **Policy PDF:** legal/human-readable source of truth.
- **HIPML:** machine-readable representation of selected executable policy rules.
- **Claim JSON:** structured representation of what happened in this particular claim.
- **Claim documents:** original evidence such as bills, prescriptions, discharge summaries and diagnostic reports.
- **pgvector/RAG:** finds relevant text evidence.
- **LLM:** explains/reasons over retrieved evidence and structured facts.

Do not collapse these into one representation.

---

# 1. HIPML Rules

HIPML is a policy representation language from Vitraya Technologies. The public TypeScript implementation includes generated ANTLR lexer/parser code and policy-evaluation helpers.

### Important distinction

HIPML does **not** represent the whole claim.

A claim can contain:

```text
patient
policy
hospitalization
bills
bill line items
prescriptions
diagnoses
procedures
discharge summary
diagnostic reports
other extracted evidence
```

Only the fields required by a particular HIPML rule need to be mapped into that rule's variables.

### Correct flow

```text
Policy PDF
  -> human/LLM-assisted policy digitization
  -> HIPML text
  -> HIPML parser
  -> parsed policy tree

Claim documents
  -> OCR/extraction
  -> structured Claim JSON
  -> claim-to-HIPML variable mapping
  -> HIPML evaluation
```

The parser parses the HIPML policy. It does not parse the claim JSON.

Conceptually:

```ts
const policy = new HIPMLService(hipmlText)
const inputs = buildHipmlInputs(claim)
const result = policy.getPolicy(inputs)
```

For the hackathon MVP:

- Use one deliberately chosen policy.
- Hand-author the HIPML file, optionally with LLM assistance.
- Validate it with the existing parser.
- Do not attempt a general PDF -> HIPML compiler.

Treat automated PDF -> HIPML conversion as a separate future problem.

---

# 2. Claim representation

The internal Claim JSON is the main representation of a claim.

Recommended MVP shape:

```ts
interface Claim {
  id: string
  policyId: string

  patient: {
    name?: string
    age?: number
    sex?: string
  }

  hospitalization: {
    admissionDate?: string
    dischargeDate?: string
    reason?: string
  }

  diagnoses: string[]
  procedures: string[]

  policy: {
    sumInsured?: number
    inceptionDate?: string
  }

  billItems: BillLineItem[]

  prescriptions: Prescription[]

  dischargeSummary?: DischargeSummary

  sourceDocumentIds: string[]
}
```

The exact schema can remain flexible for the MVP. JSONB is acceptable for general claim data; bill line items should be structured enough to support deterministic arithmetic.

---

# 3. How claim documents are used

Do not throw away the original documents after OCR.

For each document:

```text
original file
  -> MinIO object
  -> document DB record
  -> per-page text/OCR
  -> structured fields
  -> optional RAG chunks
```

A discharge summary may produce:

```text
structured facts:
  diagnosis = cataract
  procedure = cataract surgery
  admission date = ...
  discharge date = ...
```

and also retain raw evidence:

```text
"Patient is a known diabetic..."
```

The structured facts feed deterministic processing. The original text can support retrieval/LLM reasoning.

---

# 4. File upload and deduplication

Use MinIO as S3-compatible object storage rather than local disk.

The official MinIO JavaScript client exposes `putObject`, `statObject`, `removeObject`, and presigned operations such as `presignedGetObject`.

### Storage rule

Compute SHA-256 from the file bytes **before upload**.

Use the hash as the object key:

```text
claim-docs/<sha256>.pdf
```

This is content-addressed storage.

If the same bytes are uploaded again:

```text
same SHA-256
    -> same object key
    -> do not upload another object
```

The database can still have a claim-specific document row.

### Important correction

This constraint:

```sql
UNIQUE (claim_id, file_hash)
```

prevents duplicate rows for the same file within the same claim.

It does **not by itself** guarantee global storage deduplication.

True global object deduplication comes from:

```text
storage_key = SHA-256
```

in a shared bucket/namespace.

### Recommended document table

```sql
CREATE TABLE documents (
    id BIGSERIAL PRIMARY KEY,
    claim_id BIGINT REFERENCES claims(id) ON DELETE CASCADE,
    doc_type TEXT NOT NULL,
    file_hash CHAR(64) NOT NULL,
    storage_path TEXT NOT NULL,
    original_filename TEXT,
    mime_type TEXT,
    file_size BIGINT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (claim_id, file_hash)
);
```

Optionally add:

```sql
CREATE INDEX idx_documents_claim_id ON documents(claim_id);
CREATE INDEX idx_documents_file_hash ON documents(file_hash);
```

### Upload flow in a Next.js App Router Route Handler

Next.js Route Handlers use the Web Request/Response APIs and support request bodies through `formData()`.

Conceptual code:

```ts
export async function POST(request: Request) {
  const formData = await request.formData()
  const file = formData.get('file') as File

  const buffer = Buffer.from(await file.arrayBuffer())
  const hash = createHash('sha256').update(buffer).digest('hex')

  // DB lookup first
  // Upload to MinIO only if object is not already known
  // Insert claim-specific document row
}
```

### Security rules

- Do not expose the MinIO bucket publicly.
- Never return the MinIO access key/secret to the browser.
- Generate short-lived presigned GET URLs server-side for document viewing.
- Validate file type, size, and extension before processing.
- Treat uploaded files as untrusted input.
- Never trust `original_filename` for storage paths.
- Use the content hash for the object key.
- Sanitize and validate metadata.

---

# 5. Images / scanned PDFs

Claim documents are primarily evidence, not image-search objects.

For the MVP, do **not** build image embeddings unless there is a demonstrated need.

Use:

```text
PDF / image
  -> OCR / layout extraction
  -> page text
  -> structured claim facts
  -> optional text embedding
```

Preserve page-level references for auditability:

```sql
CREATE TABLE document_pages (
    id BIGSERIAL PRIMARY KEY,
    document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    raw_text TEXT,
    image_storage_path TEXT,
    ocr_metadata JSONB NOT NULL DEFAULT '{}',
    UNIQUE(document_id, page_number)
);
```

The `image_storage_path` points to the MinIO object for the page image only when needed.

Do not generate or persist page images unless the OCR/layout step actually needs them.

---

# 6. RAG storage

RAG indexes textual evidence.

For policy/regulatory knowledge:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

MVP chunk table:

```sql
CREATE TABLE document_chunks (
    id BIGSERIAL PRIMARY KEY,
    document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,

    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,

    section_title TEXT,
    subsection_title TEXT,
    clause_number TEXT,

    page_start INTEGER,
    page_end INTEGER,

    embedding vector(<EMBEDDING_DIMENSIONS>),

    metadata JSONB NOT NULL DEFAULT '{}',

    UNIQUE(document_id, chunk_index)
);
```

Replace `<EMBEDDING_DIMENSIONS>` with the actual embedding model dimension.

For the MVP, use exact nearest-neighbor search first. Do not add HNSW until retrieval quality is working.

Example:

```sql
SELECT
    id,
    content,
    section_title,
    clause_number,
    page_start,
    page_end,
    1 - (embedding <=> $1) AS cosine_similarity
FROM document_chunks
WHERE document_id = $2
ORDER BY embedding <=> $1
LIMIT 5;
```

`<=>` is pgvector cosine distance; `1 - distance` gives cosine similarity.

---

# 7. Structural chunking rules

Do not split policy/legal text solely by character count.

Preferred hierarchy:

```text
Document
  -> Section
    -> Subsection
      -> Clause
        -> Paragraph / logical unit
```

A chunk should carry its hierarchy as context.

Bad:

```text
"Limited to NPR 50,000."
```

Better:

```text
Document: ABC Health Policy
Section: Hospitalization
Clause: 7.1.2
Topic: ICU charges

ICU charges are covered up to NPR 50,000 per hospitalization.
```

Guidelines:

- Preserve headings.
- Preserve clause numbers.
- Keep conditions with the rule they qualify.
- Keep tables as coherent units.
- For tables, normalize relationships explicitly rather than flattening cells into meaningless text.
- Avoid tiny fragments that lose their parent context.
- A moderate token-size limit may be used as a secondary constraint, not the primary chunk boundary.

---

# 8. RAG query generation

Do NOT simply pass the deterministic engine's raw output to an LLM and ask the LLM to invent a search query.

The deterministic layer should produce a **retrieval need** or **finding**.

Example deterministic output:

```json
{
  "status": "NEEDS_REASONING",
  "findings": [
    {
      "code": "POSSIBLE_PRE_EXISTING_EXCLUSION",
      "needsRetrieval": true,
      "diagnosis": "diabetes",
      "procedure": "cataract surgery"
    }
  ]
}
```

Then ClaimSetu's application code converts the finding into a **retrieval plan**.

Example:

```json
{
  "intent": "exclusion_interpretation",
  "queries": [
    "Does this policy exclude cataract surgery when diabetes is a pre-existing condition?",
    "Definition of pre-existing condition under this policy",
    "Policy waiting period for pre-existing conditions"
  ],
  "filters": {
    "policyId": "P001",
    "documentTypes": ["POLICY"]
  }
}
```

This query generation should initially be **template-based and deterministic**.

### Recommended MVP query templates

```text
POSSIBLE_EXCLUSION
  -> "What does the policy say about {condition} and {treatment}?"

WAITING_PERIOD
  -> "What is the waiting period for {condition/treatment} under this policy?"

COVERAGE_CONDITION
  -> "Under what conditions is {procedure/service} covered?"

DOCUMENT_INCONSISTENCY
  -> "What does the policy require for {document/evidence} and how is it defined?"
```

Use claim facts to fill the template.

Do not include irrelevant full claim data in the query.

### Policy and regulation retrieval

For the MVP, retrieve separately:

```text
Policy evidence
Regulatory evidence
```

Then combine the results into the final evidence package.

---

# 9. What the deterministic layer should output to RAG

A good boundary is:

```ts
interface RetrievalNeed {
  code: string
  reason: string
  entities: {
    diagnoses?: string[]
    procedures?: string[]
    services?: string[]
    conditions?: string[]
  }
  policyId: string
  claimId: string
}
```

Example:

```ts
{
  code: "POSSIBLE_PRE_EXISTING_EXCLUSION",
  reason: "Claim diagnosis may match a policy exclusion.",
  entities: {
    diagnoses: ["diabetes"],
    procedures: ["cataract surgery"]
  },
  policyId: "P001",
  claimId: "C001"
}
```

A query-builder converts that into one or more natural-language retrieval queries.

The RAG system then:

```text
RetrievalNeed
  -> query text
  -> embedding
  -> Postgres similarity search
  -> top-K evidence
```

---

# 10. RAG should not decide the claim

The LLM should receive:

1. Structured claim facts.
2. Deterministic rule results.
3. Retrieved source evidence.
4. An explicit question / reasoning task.

Prompt shape:

```text
CLAIM FACTS
...

DETERMINISTIC RESULTS
...

RETRIEVED POLICY EVIDENCE
[EVIDENCE_1] ...
[EVIDENCE_2] ...

RETRIEVED REGULATORY EVIDENCE
[EVIDENCE_3] ...

TASK
Explain whether the identified exclusion appears applicable.
Use only the supplied evidence.
If evidence is insufficient, return INSUFFICIENT_EVIDENCE.
```

The LLM output should be structured JSON, for example:

```json
{
  "status": "REQUIRES_REVIEW",
  "finding": "Possible pre-existing-condition exclusion",
  "explanation": "...",
  "evidenceIds": ["EVIDENCE_1", "EVIDENCE_3"]
}
```

Never treat an LLM-generated confidence value as a calibrated probability unless it has been empirically calibrated.

---

# 11. Citation and audit requirements

Every retrieved chunk should retain:

```text
document_id
page
section
clause
source file
chunk id
similarity/distance
```

Store retrieval events:

```sql
CREATE TABLE rag_runs (
    id BIGSERIAL PRIMARY KEY,
    claim_id BIGINT REFERENCES claims(id),
    query TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rag_retrievals (
    id BIGSERIAL PRIMARY KEY,
    rag_run_id BIGINT NOT NULL REFERENCES rag_runs(id) ON DELETE CASCADE,
    chunk_id BIGINT NOT NULL REFERENCES document_chunks(id),
    rank INTEGER NOT NULL,
    distance DOUBLE PRECISION NOT NULL
);
```

The application should generate source citations from database metadata rather than trusting the LLM to invent citations.

---

# 12. Suggested MVP SQL model

Minimum entities:

```text
claims
policies
documents
document_pages
document_chunks
claim_documents
claim_bill_items
rag_runs
rag_retrievals
```

Suggested claim table:

```sql
CREATE TABLE claims (
    id BIGSERIAL PRIMARY KEY,
    policy_id BIGINT NOT NULL REFERENCES policies(id),
    submitted_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'PENDING',
    structured_data JSONB NOT NULL DEFAULT '{}',
    raw_ocr_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Suggested policy table:

```sql
CREATE TABLE policies (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    issuer TEXT NOT NULL,
    hipml_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Suggested claim-to-document association:

```sql
CREATE TABLE claim_documents (
    claim_id BIGINT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    PRIMARY KEY (claim_id, document_id)
);
```

Suggested bill line items:

```sql
CREATE TABLE claim_bill_items (
    id BIGSERIAL PRIMARY KEY,
    claim_id BIGINT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity NUMERIC(12,3),
    unit_price NUMERIC(14,2),
    total_amount NUMERIC(14,2) NOT NULL,
    service_code TEXT,
    procedure_code TEXT,
    source_document_id BIGINT REFERENCES documents(id),
    source_page INTEGER,
    raw_text TEXT
);
```

---

# 13. Next.js implementation boundaries

Use Next.js App Router Route Handlers or server-side functions for trusted operations.

Keep these operations server-side:

- database access
- MinIO credentials
- SHA-256 verification / dedup
- file upload
- OCR orchestration
- embedding API calls
- RAG retrieval
- LLM API calls
- HIPML parsing/evaluation

The browser should never receive:

- MinIO secret keys
- database credentials
- unrestricted object-store access
- privileged RAG filters

A useful server-side module layout:

```text
src/
  lib/
    db/
    storage/
    rag/
    hipml/
    claims/
  app/
    api/
      claims/
      documents/
      rag/
```

---

# 14. PDF parsing

For the first RAG demo, use a Node-compatible PDF parser such as `pdf-parse` for text-native PDFs.

Do not assume all PDFs contain text.

```text
text-native PDF
  -> PDF text extraction

scanned PDF/image
  -> OCR
```

The parser is not an OCR engine.

Preserve page boundaries because they are needed for citations and debugging.

---

# 15. Development sequence

Build in this order:

### Stage 1 — HIPML in isolation

- Run the Vitraya TypeScript implementation.
- Load one sample PML.
- Inspect discovered variables.
- Supply input values.
- Inspect evaluation output.

### Stage 2 — Claim model

- Create one claim JSON.
- Add one bill, prescription and discharge summary.
- Define structured facts.

### Stage 3 — Claim -> HIPML bridge

- Build `buildHipmlInputs(claim)`.
- Only map variables actually required by the policy.
- Run deterministic evaluation.

### Stage 4 — File storage

- Add MinIO.
- Hash uploaded files.
- Deduplicate by hash.
- Store document metadata.
- Add page-level records.

### Stage 5 — Basic RAG

- Extract one policy PDF.
- Structural chunking.
- Generate embeddings.
- Store vectors in pgvector.
- Execute exact cosine search.

### Stage 6 — Retrieval planning

- Convert deterministic finding codes into retrieval intents.
- Generate deterministic search queries.
- Retrieve policy evidence.
- Retrieve regulatory evidence.

### Stage 7 — LLM reasoning

- Give the model claim facts + deterministic output + retrieved evidence.
- Force structured output.
- Attach citations from database metadata.

### Stage 8 — Evaluation

Create 5–10 hand-checked test cases.

For each case record:

```text
expected deterministic result
expected retrieval evidence
expected final explanation
```

A RAG that produces plausible answers but retrieves the wrong clauses is not considered correct.

---

# 16. Coding principles

## Prefer

- Plain TypeScript functions over heavy RAG frameworks.
- Plain SQL for pgvector while learning.
- Small, independently testable modules.
- Explicit data transformations.
- Structured JSON schemas.
- Server-side validation.
- Source metadata preserved through every stage.
- Deterministic rules for arithmetic and policy checks.
- Template-based retrieval planning for the MVP.
- Exact retrieval before approximate indexing.

## Avoid

- LangChain for the initial RAG implementation.
- Hiding pgvector queries behind abstractions before understanding them.
- Sending the entire claim blindly to the LLM.
- Asking the LLM to calculate reimbursement limits.
- Asking the LLM to decide deterministic pass/fail rules.
- Treating the vector store as the source of truth.
- Treating embeddings as a replacement for metadata filtering.
- Automatically converting arbitrary policy PDFs into executable HIPML without validation.
- Public MinIO buckets.
- Using original filenames as object keys.
- Storing files on local disk in a way that is lost when the container/host changes.
- Creating vectors for every image when OCR/text retrieval is sufficient.
- Arbitrary fixed-size chunking without section/clause context.
- Letting the LLM fabricate legal citations.
- Treating model confidence as a probability.
- Building multi-insurer/multi-policy/version infrastructure for the hackathon MVP.

---

# 17. RAG quality rules

Retrieval quality comes before prompt cleverness.

When debugging a bad answer, inspect in this order:

```text
1. Was the correct source document searchable?
2. Was the text extracted correctly?
3. Was the text chunked correctly?
4. Was metadata filtering correct?
5. Did retrieval return the correct clause?
6. Was enough context provided?
7. Only then inspect the LLM prompt/model.
```

Never fix a retrieval problem by merely making the LLM prompt longer.

---

# 18. ClaimSetu MVP scope constraints

This is a hackathon MVP.

Keep the system narrow:

- Nepal health insurance only.
- One or a very small number of policies.
- One insurer for the demo if necessary.
- One policy representation in HIPML.
- Bills, prescriptions and discharge summaries as primary claim evidence.
- One regulatory corpus.
- Deterministic rules + targeted RAG reasoning.
- Human review remains the final decision point.

Do not build a generalized insurance platform yet.

---

# 19. Critical system boundary

The most important boundary in this project is:

```text
FACTS      = extracted from claim documents
RULES      = represented by HIPML
RETRIEVAL  = finds relevant source text
INFERENCE  = LLM reasoning over facts + evidence
DECISION   = deterministic result and/or human review
```

Agents must preserve these boundaries when adding features.

If a proposed change moves a deterministic insurance rule into an LLM prompt, treat it as an architectural regression unless there is a specific and documented reason.

---

# 20. Current MVP implementation decisions (2026-10-02)

These decisions supersede more ambitious architecture ideas for the hackathon.

## HIPML

- Use Vitraya `hipml-typescript` as a standalone Express service.
- Do not import it into Next.js for the MVP.
- It already exposes `/pml/:id/variables` and `/pml/:id/run` and contains the generated ANTLR parser/lexer.
- Keep the old dependency tree isolated in Docker; do not modernize it unless required to run.
- Hand-author one MVP `.pml` policy, optionally with LLM assistance.
- Validate every generated rule with the actual service before using it.
- Do not build generic PDF -> HIPML conversion.
- Claim JSON stays separate. Only map variables required by the PML into the `/run` body.

## File storage

- MinIO stores original uploaded documents.
- SHA-256 is calculated before upload and is used as the object key.
- `UNIQUE (claim_id, file_hash)` prevents duplicate registration for one claim.
- MinIO object identity provides cross-claim storage deduplication.
- Do not make the object bucket public; use short-lived presigned URLs.

## MVP PostgreSQL

Use the simplified schema in `schema.md`:

```text
policies
claims
documents
claim_bill_items
document_chunks
rag_runs
rag_retrievals
```

Use BIGSERIAL IDs consistently. Avoid multi-version/multi-tenant abstractions for the hackathon. Store `hipml_file_id` on `policies`; keep the actual `.pml` file in the standalone HIPML service for the MVP.

## RAG boundary

HIPML output creates structured findings. A deterministic query planner converts flagged findings into retrieval queries. RAG retrieves source evidence; the LLM explains/reasons over that evidence. RAG does not re-run deterministic policy arithmetic or replace HIPML.

---

# 2026-10-02 MVP Refinements — Document Processing, HIPML Conversion, and RAG

## Existing extraction/OCR code is reference only

The previously written `extractor.ts` and `ocr.ts` are useful references for ClaimSchemaV0_2 shape, JSON validation, reconciliation flags, Tesseract `execFile` usage, cleanup, and English + Nepali OCR. They are not the target architecture.

Do not copy fallback behavior that fabricates missing facts. The old extractor currently fills some missing fields with values such as today's date, generic hospital/claimant values, or generic diagnoses; it also overwrites the source-declared total with the computed line-item sum. ClaimSetu must instead preserve uncertainty.

Required behavior:

```text
missing value -> null / missing + explicit flag
uncertain extraction -> preserve raw text + flag
source total != computed total -> preserve both + discrepancy flag
combined charge -> do not invent a split
```

Never invent claim facts.

Keep at least:

```text
declared_total_from_source
computed_line_item_total
```

## OCR/container architecture

MinIO is storage, not OCR.

Preferred architecture:

```text
MinIO
  |
  | object bytes
  v
ClaimSetu processing/OCR worker
  |
  +--> PDF text extraction
  +--> render scanned pages when required
  +--> Tesseract OCR for scanned pages
  v
normalized text / structured claim
```

Do not require the host machine to have Tesseract installed. Prefer a dedicated Docker image/worker containing Node.js, Tesseract, `eng` and `nep` language data.

If Node invokes Tesseract, keep the previous safe pattern of `execFile()` with explicit argument arrays and deterministic temp-file cleanup. Never concatenate user-controlled shell commands.

## MinIO

Store original claim files/images in a private MinIO bucket.

Use SHA-256 content addressing:

```text
claim-docs/<sha256>
```

Database association remains claim-specific:

```text
UNIQUE (claim_id, file_hash)
```

The same bytes may be associated with multiple claims while being physically stored once.

After server-side authorization, generate short-lived presigned GET URLs for browser access.

## PDF -> HIPML

Do not build an arbitrary PDF-to-HIPML compiler for the hackathon.

Use:

```text
policy.pdf
 -> clause inventory
 -> executable / text-only / ambiguous classification
 -> LLM-assisted HIPML drafting
 -> Vitraya parser validation
 -> semantic fixtures
 -> final policy.pml
```

The original policy clause remains the source of truth. The LLM is only a drafting/normalization assistant.

## RAG

RAG is retrieval, not adjudication.

```text
HIPML finding
 -> deterministic query planner
 -> embedding
 -> policy-scoped pgvector search
 -> top-k evidence
 -> later LLM explanation
```

V1 uses deterministic query templates rather than LLM-generated queries.

## RAG quality

Test retrieval directly using:

```text
Recall@1
Recall@3
policy isolation
citation/metadata preservation
negative-query score distributions
```

Do not declare success because an LLM produced persuasive prose.

## MVP discipline

Do not add until the baseline works:

```text
HNSW
reranking
hybrid search
query expansion
multiple policy versions
tenant partitioning
AST persistence
distributed job infrastructure
```

---

# 10. Frontend-Backend Integration & Server Actions Conventions

## Core Principles

1. **Prefer Server Actions Over API Routes**:
   - For UI data loading, mutations, and dashboard aggregations, prefer Next.js Server Actions over client-side `fetch()` to internal API endpoints.
   - Server Actions run on the server with direct, authenticated database access via `@/lib/db`, eliminating unnecessary network round-trips and JSON serialization overhead.

2. **Dedicated `actions/` Directory**:
   - Store all Server Actions within a dedicated `actions/` folder (e.g., `nextjs/actions/insurer-dashboard.ts`, `nextjs/actions/claims.ts`).
   - Keep actions modular, typed, and organized by domain.

3. **Naming Convention**:
   - Strictly append `Action` to every Server Action function name.
   - Examples:
     - `getDashboardDataAction()`
     - `getClaimsQueueAction()`
     - `updateClaimStatusAction()`

4. **Preserve Existing API Routes**:
   - Do NOT delete, break, or rearrange existing API routes (`app/api/claims/*`, `app/api/policies/*`, `app/api/institutions/*`, `app/api/auth/*`).
   - Keep them intact for external services, webhooks, or automated test suites.

5. **Natural Boundaries (No Forcing)**:
   - Do NOT force Server Actions where they are unnatural or inefficient.
   - Keep API routes for multipart file streaming, presigned binary downloads, NextAuth handlers, and public webhook callbacks.

6. **Insurer Policies Management View Specifications**:
   - **Adding New Policies**:
     - Keep strictly minimal inputs: **Policy Name** and **Policy Code / ID** (plus document contract upload).
     - Do NOT require manual entry for *Room Rent Tariff Cap*, *Coverage Tier*, *Patient Co-Pay*, or *Underwriter Entity*.
   - **Policy Inspection Modal**:
     - When clicking "View" on a policy card, open an interactive popup modal displaying:
       1. **Policy Code / ID** (e.g. `POL-SHK-781`)
       2. **Policy Name** (e.g. `Shikhar Health Policy`)
       3. **Embedded PDF Viewer** displaying the policy document with open in tab/download capabilities.
       4. Registration date and dismiss button.
     - Eliminate obsolete tariff caps, tier, and copay blocks from the view popup.


