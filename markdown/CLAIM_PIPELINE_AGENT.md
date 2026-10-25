# ClaimSetu — Claims Document → Structured Claim → HIPML → RAG Pipeline

## Mission

Implement and independently test the **pre-reasoning ClaimSetu backend pipeline**.

The target flow is:

```text
4 claim documents
  ├── claim form
  ├── bill
  ├── discharge summary
  └── prescription
          |
          v
POST /api/claims/:claimId/documents
          |
          +--> authenticate / authorize
          +--> SHA-256 hash
          +--> duplicate lookup
          +--> MinIO object storage
          |
          v
PDF text extraction OR image OCR
          |
          v
raw extracted text per document
          |
          v
LLM structured extraction
          |
          v
validated per-document structured data
          |
          +--> reuse on duplicate upload; NEVER call LLM again
          |
          v
aggregate Claim JSON
          |
          v
Claim -> HIPML variable mapper
          |
          v
Vitraya HIPML service
  GET /pml/:id/variables
  POST /pml/:id/run
          |
          v
Deterministic findings
          |
          v
RAG query planner
          |
          v
RAG /query
          |
          v
retrieved evidence
```

The final LLM reasoning/explanation stage is intentionally **out of scope for this phase**.

---

# 1. Architectural boundaries

## Next.js owns

```text
upload API
claim access control
claim/document DB records
MinIO interaction
processing orchestration
LLM extraction call
structured claim aggregation
claim -> HIPML variable mapping
HIPML HTTP client
RAG HTTP client
```

## OCR/parser module owns

```text
PDF text extraction
scanned-page detection
image OCR
```

For this MVP, **assume Tesseract is already installed and available on the machine** with both `eng` and `nep` language data. Do NOT introduce a new OCR container, Docker image, or remote OCR service just for this pipeline.

The old `ocr.ts` used Node `execFile`, a random temporary path, explicit arguments, `eng+nep`, and `finally` cleanup. Preserve that security/cleanup pattern when adapting it.

## Vitraya HIPML service owns

```text
HIPML parsing
HIPML variable discovery
HIPML deterministic policy evaluation
```

Do NOT import the old Vitraya Express application into Next.js. Call it over HTTP.

## RAG demo owns

```text
policy/regulation ingestion
chunking
embedding
pgvector retrieval
retrieval audit
```

Do NOT put final claim adjudication into the RAG service.

---

# 2. Critical deduplication invariant

A repeated upload of the **same bytes for the same claim** MUST NOT trigger a second structured extraction LLM call.

The invariant is:

```text
same claim_id + same SHA-256
        => same document
        => same MinIO object
        => reuse existing extracted_data
        => no new extraction LLM call
```

The database uniqueness constraint should be:

```sql
UNIQUE (claim_id, file_hash)
```

The MinIO object key should be content-addressed:

```text
claim-docs/<sha256>
```

The same bytes may be associated with multiple claims, so `file_hash` must NOT be globally unique in the `documents` table.

If the same hash is uploaded to the same claim but with a different `doc_type`, do not silently reinterpret it. Return a clear conflict or require the original document type to be used.

---

# 3. Upload API

Implement:

```text
POST /api/claims/:claimId/documents
Content-Type: multipart/form-data
```

Accepted form fields:

```text
claim
bill
prescription
discharge_summary
```

Allow one or multiple fields per request.

Example:

```bash
curl -X POST http://localhost:3000/api/claims/1/documents \
  -F "claim=@./fixtures/claim.pdf" \
  -F "bill=@./fixtures/bill.pdf" \
  -F "prescription=@./fixtures/prescription.pdf" \
  -F "discharge_summary=@./fixtures/discharge_summary.pdf"
```

The endpoint must:

1. authenticate with the existing Auth.js setup;
2. verify the caller can access the claim;
3. validate file count, extension/MIME, and size;
4. read the file bytes;
5. calculate SHA-256 before MinIO upload;
6. query the duplicate key `(claim_id, file_hash)`;
7. if duplicate exists, return the existing document and its stored extraction result;
8. otherwise store/reuse the MinIO object;
9. insert the `documents` row;
10. run extraction/processing for the new document;
11. return document processing status and structured extraction metadata.

Never trust the client-provided filename as a storage path.

Never make the MinIO bucket public.

---

# 4. Document lifecycle

Use explicit status values so the pipeline is debuggable:

```text
UPLOADED
EXTRACTING
EXTRACTED
STRUCTURING
STRUCTURED
FAILED
```

Do not make upload success imply processing success.

Example:

```json
{
  "documentId": 14,
  "docType": "bill",
  "status": "STRUCTURED",
  "reused": false
}
```

Duplicate response:

```json
{
  "documentId": 14,
  "docType": "bill",
  "status": "STRUCTURED",
  "reused": true,
  "extractionReused": true
}
```

---

# 5. PDF extraction and OCR

Adapt the previous project into two clear paths:

```ts
extractPdfText(buffer): Promise<ExtractedText>
runOcr(buffer, extension): Promise<ExtractedText>
```

For this MVP, Tesseract is already installed on the developer/runtime machine and can be called directly from Node. Assume:

```text
tesseract
eng language data
nep language data
```

are available on `PATH`. Do not create an additional OCR container.

### Input routing

Multipart upload may contain either PDFs or images. Route by the actual MIME type / validated file type:

```text
multipart file
    │
    ├── application/pdf
    │      ↓
    │   extractPdfText()
    │      │
    │      ├── useful text found -> use extracted text
    │      │
    │      └── scanned/poor text -> render PDF pages -> runOcr()
    │
    └── image/*
           ↓
        runOcr()
```

Do not send a normal text PDF through Tesseract unnecessarily.

For a direct image upload:

```text
image -> OCR -> raw extracted text
```

For a scanned/image-only PDF:

```text
PDF -> page rendering -> OCR each page -> combined raw text
```

Keep page numbers when possible. If page mapping is unreliable, leave it null instead of inventing it.

The old OCR helper's `execFile` argument-array pattern and `finally` cleanup are good security patterns to retain. Do not use shell interpolation such as `exec("tesseract " + filename)`.

---

# 6. Structured extraction LLM

Adapt the previous `extractor.ts` concept, but make it document-aware.

There should be one extraction function:

```ts
extractDocumentToStructuredData({
  rawText,
  docType,
  documentId,
  claimId
})
```

The LLM is an **extractor, not an adjudicator**.

It must not set:

```text
approved_amount
claim decision
compliance verdict
fraud verdict
policy interpretation
```

unless a later deterministic layer explicitly owns those fields.

Use a strict structured JSON schema and validate the result with Zod.

Google's current GenAI SDK supports structured JSON output with a JSON schema, including JavaScript/Zod integration. Prefer the current `@google/genai` SDK for new code, with model name/configuration read from environment variables rather than hard-coded. See the current Google structured-output and SDK migration documentation.

The LLM extraction prompt MUST say:

```text
Extract only facts present in the source.
Do not invent missing values.
Use null/empty arrays for missing structured values.
Preserve uncertain source text in unresolved/unmapped fields.
Do not infer policy coverage or approval.
Do not calculate a final claim decision.
```

---

# 7. Important correction to the previous extractor

The old extractor is reference material only.

It currently contains fallback behavior that is unacceptable for ClaimSetu. It can fill missing values with fabricated defaults and can overwrite the declared total with the computed line-item total.

Do NOT reproduce that behavior.

For example, do not do:

```text
missing admission date -> today's date
missing hospital -> "Hospital"
missing diagnosis -> "General diagnosis"
```

Use:

```text
missing -> null
uncertain -> unresolved/unmapped + source text
```

Also retain both:

```text
declared_total
computed_line_item_total
```

and add a discrepancy flag when they differ.

Never destroy source truth to make validation pass.

Likewise, do not split:

```text
"Surgery and anesthesia: NPR 51,000"
```

into guessed surgery/anesthesia amounts.

---

# 8. Structured data model

Use a common Claim JSON envelope close to the existing `ClaimSchemaV0_2`, but divide extraction by source document.

A practical MVP shape is:

```json
{
  "claim_id": "CLM-001",
  "policy": {
    "policy_number": "POL-001",
    "sum_insured": 500000,
    "inception_date": "2025-01-01"
  },
  "claimant": {
    "name": "...",
    "id_number": null
  },
  "hospitalization": {
    "admission_date": "2026-09-10",
    "discharge_date": "2026-09-12",
    "hospital_name": "..."
  },
  "diagnoses": [],
  "procedures": [],
  "line_items": [],
  "prescriptions": [],
  "source_documents": [],
  "extraction_flags": []
}
```

Keep the full original OCR/text artifacts separately in the `documents` rows.

For each document, keep a document-specific `extracted_data` JSONB object.

Example bill extraction:

```json
{
  "doc_type": "bill",
  "hospital_name": "ABC Hospital",
  "bill_number": "B-1042",
  "line_items": [
    {
      "description": "Room charge",
      "quantity": 3,
      "unit_price": 5000,
      "claimed_amount": 15000
    }
  ],
  "declared_total": 15000,
  "computed_line_item_total": 15000,
  "discrepancy": false
}
```

Example discharge extraction:

```json
{
  "doc_type": "discharge_summary",
  "admission_date": "2026-09-10",
  "discharge_date": "2026-09-12",
  "diagnoses": ["Cataract"],
  "procedures": ["Cataract surgery"],
  "raw_unresolved": []
}
```

---

# 9. Aggregate claim JSON

Do not require one LLM call over all four files just to combine data.

Preferred pipeline:

```text
bill extraction --------------------┐
claim-form extraction --------------┤
prescription extraction ------------┤--> deterministic aggregation --> Claim JSON
 discharge-summary extraction -------┘
```

The aggregation code should resolve obvious fields deterministically:

```text
admission date
  = discharge summary if present
  = otherwise claim form if present
  = otherwise null + flag
```

But do not silently choose between conflicting values.

Example:

```json
{
  "field": "admission_date",
  "values": [
    {"source": "claim", "value": "2026-09-10"},
    {"source": "discharge_summary", "value": "2026-09-11"}
  ],
  "status": "CONFLICT"
}
```

For the MVP, a simpler `extraction_flags` entry is acceptable:

```text
ADMISSION_DATE_CONFLICT
```

The original source values must remain traceable.

---

# 10. Claim row vs document rows — important data model rule

A **claim is one logical insurance claim**. It gets one row in `claims`.

A claim can have many uploaded source documents. Each uploaded document gets its own row in `documents`.

Example:

```text
claims
--------------------------------
id = 1
structured_data = { unified Claim JSON ... }

documents
--------------------------------
id = 10 | claim_id = 1 | doc_type = claim
id = 11 | claim_id = 1 | doc_type = bill
id = 12 | claim_id = 1 | doc_type = prescription
id = 13 | claim_id = 1 | doc_type = discharge_summary
```

There is **NOT** one `claims` row per uploaded file.

The final `claims.structured_data` is the single unified Claim JSON assembled from all accepted document-level extraction results.

Document-level extraction caching belongs on the document side, e.g. `documents.extracted_text` / `documents.extracted_data` / `documents.processing_status` if the schema provides those columns.

Therefore the lifecycle is:

```text
4 document uploads
   ↓
4 documents rows
   ↓
4 document-level extraction results
   ↓
deterministic aggregation
   ↓
1 unified claims.structured_data
```

If the exact same file is uploaded again for the same claim:

```text
existing documents row found by (claim_id, file_hash)
        ↓
reuse that document's stored extraction result
        ↓
do NOT create another documents row
        ↓
do NOT run OCR again
        ↓
do NOT run the extraction LLM again
```

If one new, non-duplicate document is added to an existing claim, create one new `documents` row, process only that document, then re-aggregate the unified `claims.structured_data` from the available document extraction results.

The aggregate claim JSON should be deterministic and source-traceable. Do not use an LLM merely to merge four already-structured document JSON objects.

---

# 11. Per-document extraction caching / reuse

This is mandatory.

For each new document:

```text
hash
 |
 +--> existing documents row?
       |
       +--> YES
       |     |
       |     +--> return existing extracted_data
       |     +--> do not call extraction LLM
       |     +--> do not OCR again
       |
       +--> NO
             |
             +--> store object
             +--> OCR/PDF extraction
             +--> LLM extraction
             +--> validate JSON
             +--> store extracted_data
```

Even if the MinIO object already exists because another claim uploaded the same bytes, the claim-specific `documents` record may still need to be inserted. The expensive extraction result should be reusable.

If implementing cross-claim reuse in the MVP, prefer reusing a stored extraction result keyed by `file_hash` rather than recomputing it.

Do not make extraction cache invalidation complicated for the hackathon. Record the extraction model/prompt version, but keep the current version fixed.

---

# 12. HIPML variable mapper

Create:

```text
hipml/claim_to_variables.mjs
```

Responsibilities:

1. receive aggregate Claim JSON;
2. receive the variable names from:
   `GET /pml/{policyPmlId}/variables`;
3. map only supported fields;
4. produce the exact JSON object expected by Vitraya `/run`;
5. fail explicitly when a required variable has no trustworthy source value.

Example:

```js
const variables = {
  "Sum Insured": claim.policy.sum_insured,
  "Policy inception Date": claim.policy.inception_date,
  "Hospitalization start date": claim.hospitalization.admission_date,
  "Discharge Date": claim.hospitalization.discharge_date,
  "Claim Submission Date": claim.submitted_at
};
```

The map must be explicit and reviewable.

Do not dump the entire Claim JSON into the HIPML service.

Do not invent missing values.

Example failure:

```json
{
  "error": "MISSING_HIPML_VARIABLE",
  "variable": "Hospitalization start date"
}
```

If the policy has a variable the MVP claim model cannot supply, either add a deliberate claim field or exclude/defer that policy rule. Do not fabricate a value.

---

# 13. HIPML service call sequence

For a claim:

```text
GET /pml/{pmlId}/variables
        |
        v
claim_to_variables()
        |
        v
POST /pml/{pmlId}/run
```

The result should be stored/returned as deterministic validation output.

Do not let this stage call the LLM.

Do not let RAG influence the HIPML result.

---

# 14. Detect RAG findings from HIPML result

After `/run`, create a normalized internal list:

```ts
interface RetrievalFinding {
  code: string;
  item: string;
  claimFact: string;
  reason: string;
}
```

Examples:

```text
WAITING_PERIOD
PRE_EXISTING_EXCLUSION
COVERAGE_EXCLUSION
SUBLIMIT
CLAIM_ADMISSIBILITY
PATIENT_ELIGIBILITY
```

For the MVP, generate findings deterministically from the known output structure rather than asking an LLM to interpret the HIPML JSON.

A finding should exist only when the deterministic result indicates:

```text
included = false
condition = false
admissibility = false
or an actual amount exceeds a returned limit
```

Do not run RAG for every claim field.

---

# 15. RAG query construction

The RAG query should be generated from the **finding**, not from the entire claim.

Example:

```js
function buildQueries(finding) {
  switch (finding.code) {
    case "WAITING_PERIOD":
      return [
        `waiting period for ${finding.item}`,
        `waiting period for pre-existing conditions relevant to ${finding.item}`
      ];

    case "PRE_EXISTING_EXCLUSION":
      return [
        `pre-existing condition exclusion for ${finding.item}`,
        `definition of pre-existing condition`
      ];

    case "SUBLIMIT":
      return [
        `limit or sub-limit for ${finding.item}`
      ];

    default:
      return [
        `${finding.item}: claim states "${finding.claimFact}". ` +
        `Explain the policy coverage, exclusion, limit, or condition relevant to this finding.`
      ];
  }
}
```

No LLM call is needed to create these queries in V1.

---

# 16. Call the RAG service

For every finding:

```text
finding
  |
  v
build query
  |
  v
POST /query
  {
    "policy_id": 1,
    "flagged_items": [...]
  }
  |
  v
retrieved chunks
```

The retrieved result must retain:

```text
chunk ID
policy ID
clause reference
section title
page if known
similarity/distance
source document
content
```

This is the final output for this phase.

Do not generate a prose adjudication yet.

---

# 17. Final pipeline response

The complete test endpoint may eventually return something like:

```json
{
  "claimId": 1,
  "documents": [
    {"id": 10, "type": "claim", "reused": false},
    {"id": 11, "type": "bill", "reused": false},
    {"id": 12, "type": "prescription", "reused": false},
    {"id": 13, "type": "discharge_summary", "reused": false}
  ],
  "claim": {"...": "structured claim JSON"},
  "hipml": {
    "variables": {"...": "..."},
    "result": {"...": "..."},
    "findings": ["..."]
  },
  "rag": {
    "queries": ["..."],
    "evidence": ["..."]
  }
}
```

This is a **debug/development response**, not the eventual user-facing API contract.

---

# 18. Curl-based test plan

The agent MUST make the pipeline independently testable with curl.

## Test 1 — upload all four documents

```bash
curl -X POST http://localhost:3000/api/claims/1/documents \
  -F "claim=@./fixtures/claim.pdf" \
  -F "bill=@./fixtures/bill.pdf" \
  -F "prescription=@./fixtures/prescription.pdf" \
  -F "discharge_summary=@./fixtures/discharge_summary.pdf"
```

Expected:

```text
4 document records
4 extracted/structured outputs
1 aggregate claim JSON
HIPML evaluation attempted
RAG attempted only for findings
```

## Test 2 — repeat exact same upload

Run the exact same curl again.

Expected:

```text
same document IDs
same SHA-256 hashes
reused = true
no second OCR call
no second extraction LLM call
no duplicate document records
```

The response should make reuse obvious.

## Test 3 — same bytes under another filename

Copy a file without modifying bytes:

```bash
cp bill.pdf renamed_bill.pdf
```

Upload it under the same claim.

Expected:

```text
same SHA-256
same document association
no new extraction
```

## Test 4 — modified file

Modify the document by changing its bytes.

Expected:

```text
new SHA-256
new document record
new extraction
```

## Test 5 — extraction validation

Use fixtures with:

```text
known admission date
known discharge date
known diagnosis
known line items
known total
```

Assert extracted JSON contains the expected values.

## Test 6 — missing/ambiguous data

Create a fixture where a bill says:

```text
Surgery and anesthesia: NPR 51,000
```

Expected:

```text
one combined line item
no guessed split
```

## Test 7 — OCR path

Use an image/scanned document fixture with English + Nepali text.

Expected:

```text
OCR succeeds
text is stored
structured extraction receives OCR text
```

## Test 8 — HIPML mapper

Given a known Claim JSON, assert that:

```text
Sum Insured
Policy inception Date
Hospitalization start date
Discharge Date
Claim Submission Date
```

are mapped correctly when the policy requests them.

## Test 9 — missing HIPML input

Remove a required source field.

Expected:

```text
explicit MISSING_HIPML_VARIABLE error/flag
```

Never substitute a fake value.

## Test 10 — HIPML finding → RAG

Use a fixture where the HIPML output produces:

```text
WAITING_PERIOD
```

Expected:

```text
query planner creates waiting-period query
RAG returns the expected policy clause
```

---

# 19. Testing the LLM extraction layer properly

The extraction LLM must be tested independently from OCR, HIPML and RAG.

Create fixtures:

```text
fixtures/extraction/
  bill-table.txt
  bill-prose.txt
  discharge-summary.txt
  prescription.txt
  ambiguous-bill.txt
```

For each fixture define a golden JSON or assertions for the important fields.

Test:

```text
valid JSON
Zod validation
missing fields remain null
amount parsing
line-item preservation
source references
no fabricated defaults
```

Do not test extraction success by comparing the LLM's entire JSON byte-for-byte. Assert important semantic fields and invariants.

---

# 20. Extraction caching tests

Mock/count LLM extraction calls.

Example:

```text
First upload:
  extractionCalls = 4

Second identical upload:
  extractionCalls = 4  // unchanged
```

The test fails if it becomes:

```text
8 calls
```

This test is essential because re-uploading is expected during development and demo preparation.

---

# 21. Dependencies

Keep the implementation small.

Recommended runtime packages:

```text
pg
minio
zod
dotenv
@google/genai
pdf-parse
```

For HTTP/API testing:

```text
express
```

For tests:

```text
vitest
supertest
```

Use the existing Next.js/Auth.js stack for the main API instead of adding another authentication system.

Do not introduce LangChain/LangBase/LlamaIndex.

Do not introduce an ORM for the raw pgvector retrieval query.

---

# 22. What the agent must NOT do

Do not:

- fabricate missing claim facts;
- let an LLM decide the claim outcome;
- make the LLM responsible for arithmetic that code can perform;
- regenerate structured data for a duplicate file;
- overwrite source totals to hide discrepancies;
- split combined bill charges without source support;
- put the full claim JSON into HIPML;
- let RAG override HIPML deterministic output;
- perform global vector search across unrelated policies;
- expose MinIO publicly;
- store PDFs/images as PostgreSQL blobs;
- invoke Tesseract through shell-string concatenation;
- hide processing failures behind successful HTTP responses;
- add the final reasoning LLM at this stage;
- add unnecessary queues/distributed workers before the synchronous pipeline is proven.

---

# 23. Definition of done

The implementation is complete when a developer can run:

```bash
curl -X POST http://localhost:3000/api/claims/1/documents \
  -F "claim=@./fixtures/claim.pdf" \
  -F "bill=@./fixtures/bill.pdf" \
  -F "prescription=@./fixtures/prescription.pdf" \
  -F "discharge_summary=@./fixtures/discharge_summary.pdf"
```

and observe, in one pipeline:

```text
upload
 -> hash
 -> MinIO
 -> PDF extraction / OCR
 -> validated structured document JSON
 -> aggregate Claim JSON
 -> HIPML variable mapping
 -> HIPML deterministic result
 -> flagged findings
 -> deterministic RAG queries
 -> top-k policy evidence
```

Then the exact same command can be repeated and demonstrate:

```text
same hashes
same document IDs
reused extraction JSON
zero new extraction LLM calls
```

The final output must expose enough IDs/statuses to debug every stage independently.

---

# 24. Implementation order

Implement in this order; do not skip ahead:

```text
1. Inspect existing DB schema + current Next.js/Auth.js setup
2. Adapt documents table for processing/extracted_data fields if required
3. Implement MinIO client + SHA-256 dedup
4. Implement multi-file POST handler
5. Adapt PDF extraction helper
6. Adapt containerized Tesseract OCR helper
7. Implement structured extraction LLM + Zod validation
8. Persist per-document extracted_data
9. Implement aggregate Claim JSON
10. Add duplicate extraction reuse tests
11. Implement HIPML HTTP client
12. Implement claim -> HIPML variable mapper
13. Implement HIPML result normalization / finding extraction
14. Connect to RAG /query
15. Add end-to-end curl tests
16. Add failure-path tests

Only after all of that is working should the project add the final LLM reasoning layer.

---

# 25. Reference material

Previous project's `extractor.ts` is a reference for the existing ClaimSchemaV0_2 envelope, Zod validation, extraction flags, line-item structure, and Gemini extraction approach.

Previous project's `ocr.ts` is a reference for safe Tesseract invocation, temporary-file handling, and `eng+nep` OCR.

Use their useful ideas, but adapt them to this architecture and fix unsafe fallback/data-integrity behavior.

The existing ClaimSetu backend plan establishes the intended service boundary:

```text
Next.js backend
  -> HIPML service over HTTP
  -> RAG service over HTTP
```

The RAG golden retrieval tests have already passed. Preserve that working baseline while integrating the retrieval call into the claim pipeline.

---

# 26. Final invariant

Always preserve this distinction:

```text
RAW DOCUMENTS
    = source evidence

STRUCTURED CLAIM JSON
    = extracted facts

HIPML
    = policy rules

HIPML RESULT
    = deterministic policy evaluation

RAG
    = retrieval of relevant textual evidence

LLM REASONING (later)
    = explanation/inference over facts + deterministic results + evidence
```

Never collapse these layers into one LLM call.
