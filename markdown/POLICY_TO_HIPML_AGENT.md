# ClaimSetu — PDF → HIPML Agent Instructions (MVP)

## Mission

Build a small, auditable script that converts **one insurance policy PDF** into a validated HIPML `.pml` file for the ClaimSetu hackathon MVP.

Do **not** build a general-purpose insurance-policy compiler. The goal is to produce a reliable HIPML representation for one selected policy, using an LLM as a drafting assistant and the existing Vitraya HIPML service as the validator/evaluator.

## Core architecture

```text
policy.pdf
   |
   +--> local extraction artifact (for traceability/fallback)
   |
   +--> LLM clause inventory
   |       |
   |       v
   |   executable vs non-executable clauses
   |
   +--> HIPML generation, clause-by-clause
   |
   +--> Vitraya HIPML service validation
   |       |
   |       +--> GET /pml/{id}/variables
   |       +--> POST /pml/{id}/run
   |
   v
policy.pml
+
variable-map.json
+
conversion-report.json
```

## Important conceptual boundary

HIPML represents the **policy rules**.

The claim is a separate structured object.

```text
Policy PDF -> HIPML
Claim documents -> OCR/extraction -> Claim JSON

Claim JSON -> variable-map -> HIPML /run
```

Do not put the entire claim, bills, prescriptions, or discharge summaries into HIPML.

Only values required by the policy's HIPML variables are mapped into the HIPML input object.

## Current Vitraya integration

Treat `/hipml-typescript` as a standalone HTTP service.

Do not import its old Express application into the main Next.js application.

Expected interface:

```text
GET  /pml/{pml_unique_id}/variables
POST /pml/{pml_unique_id}/run
```

The service loads `[name].pml` from its `app/pmls/` directory.

Use native `fetch()` from the conversion script to call it.

## Dependencies

Keep this script small:

```text
runtime:
  Node.js 20+ for the new ClaimSetu tooling

packages:
  @google/genai
  pdf-parse
  zod
  dotenv

dev:
  typescript
  tsx
  vitest
  @types/node
```

Use `@google/genai`, not the older `@google/generative-ai` package, for new Google Gemini work. Google currently documents `@google/genai` for JavaScript and the Files API/document input for PDFs.

`pdf-parse` is only the local extraction/fallback layer. It is not the HIPML parser.

## Step 1 — Preserve the source

Input:

```text
policy.pdf
```

Create an immutable local working directory:

```text
policy_work/
  source/
    policy.pdf
  extracted/
    raw-text.txt
    pages.json
  generated/
    clause-inventory.json
    hipml-draft.pml
    variable-map.json
    conversion-report.json
```

Never overwrite the original PDF.

Calculate and record SHA-256 for the source.

## Step 2 — Extract/read the policy

Use `pdf-parse` to create a local text artifact.

Also record page boundaries where possible.

If extracted text is clearly poor/empty, do not silently continue. Mark the extraction as failed and use an OCR/document-understanding path.

For a policy PDF, Gemini may also be given the original PDF directly for layout-aware understanding. Prefer this when tables, columns, or visual structure make plain text extraction unreliable.

The LLM must never be the only copy of the source: always retain the original PDF and extracted artifact.

## Step 3 — Create a clause inventory BEFORE generating HIPML

Do not ask the model:

> "Convert this entire PDF to HIPML."

First ask for a JSON inventory:

```json
{
  "policy_name": "...",
  "clauses": [
    {
      "id": "C-001",
      "page": 4,
      "section": "Coverage",
      "title": "Room Rent",
      "source_text": "...",
      "classification": "EXECUTABLE",
      "entities": ["room_charge"],
      "variables_needed": ["Sum Insured"],
      "reason": "Contains a numeric coverage limit."
    },
    {
      "id": "C-002",
      "page": 7,
      "section": "Definitions",
      "title": "Pre-existing Condition",
      "source_text": "...",
      "classification": "TEXT_ONLY",
      "variables_needed": [],
      "reason": "Definition is explanatory text, not an executable rule."
    }
  ]
}
```

Allowed classifications:

```text
EXECUTABLE
TEXT_ONLY
AMBIGUOUS
```

Rules:

- `EXECUTABLE` -> candidate for HIPML.
- `TEXT_ONLY` -> retain for RAG, do not force into HIPML.
- `AMBIGUOUS` -> human review required.

This inventory is one of the most important outputs of the conversion script.

## Step 4 — Generate HIPML in small groups

Generate HIPML from one logical section or small group of related clauses at a time.

The prompt must include:

1. the relevant source clauses;
2. the HIPML grammar/spec examples needed for those constructs;
3. the expected variables;
4. a strict requirement not to invent policy rules;
5. a requirement to return source clause IDs next to each generated rule.

Expected model output:

```json
{
  "source_clause_ids": ["C-001"],
  "hipml": "Coverage:\n  ...",
  "unrepresentable": [],
  "notes": []
}
```

The source clause ID is mandatory.

Do not allow a generated rule with no traceable source clause.

## Step 5 — Validate syntax immediately

Write the generated HIPML into the Vitraya service's PML directory using a temporary ID.

Call:

```text
GET /pml/{id}/variables
```

A successful response means the policy is syntactically parseable and its variables can be discovered.

If parsing fails:

```text
LLM draft
   -> parser error
   -> correction prompt containing ONLY the error + source clause
   -> validate again
```

Maximum automatic repair attempts: 2.

After two failures, mark the clause `REVIEW_REQUIRED`.

Do not keep trying indefinitely.

## Step 6 — Validate semantics with fixtures

Parsing is not enough.

For each executable rule, create at least:

```text
positive case
negative case
boundary case
```

Example:

```text
Rule:
Room rent <= 2% of sum insured

Fixture A:
sum insured = 500000
room = 9000
expected = PASS

Fixture B:
sum insured = 500000
room = 12000
expected = FAIL

Fixture C:
sum insured = 500000
room = 10000
expected = BOUNDARY/PASS depending on exact policy wording
```

Send the variable map to:

```text
POST /pml/{id}/run
```

Compare the returned result with the expected outcome.

The expected outcome must come from the source policy clause, not from the LLM.

## Step 7 — Build the variable map separately

Do not hard-code claim values into the `.pml` file.

Create:

```text
variable-map.json
```

Example:

```json
{
  "Sum Insured": "$.policy.sumInsured",
  "Policy inception Date": "$.policy.inceptionDate",
  "Hospitalization start date": "$.hospitalization.startDate",
  "Discharge Date": "$.hospitalization.endDate",
  "Claim Submission Date": "$.submittedAt"
}
```

This explicitly defines the bridge:

```text
Claim JSON
   |
   +--> $.policy.sumInsured
   |
   +--> $.hospitalization.startDate
   |
   v
HIPML input object
```

If the policy needs a variable that the ClaimSetu claim model cannot supply, do NOT invent a value. Either:

- add the field deliberately to the claim model, or
- simplify/defer that rule for the MVP.

## Step 8 — Assemble final policy.pml

Only after individual sections validate should the script combine them into:

```text
policy.pml
```

Then run the complete policy through `/variables` and `/run` once more.

Create:

```text
conversion-report.json
```

containing:

```json
{
  "source_sha256": "...",
  "clauses_total": 20,
  "executable": 8,
  "text_only": 9,
  "ambiguous": 3,
  "hipml_rules_generated": 8,
  "parser_valid": true,
  "semantic_tests_passed": 7,
  "semantic_tests_failed": 1,
  "manual_review_required": ["C-013", "C-017", "C-019"]
}
```

## What MUST remain outside HIPML

Keep these as source text / claim data unless a specific HIPML rule needs a derived value:

```text
- complete bills
- every bill line item
- prescription text
- discharge summary text
- diagnostic report text
- arbitrary medical narrative
- explanatory definitions
- long legal prose
```

Those belong in the structured claim model and/or RAG corpus.

<!-- ## Extraction safety requirements

The previously written extractor is useful as a reference for schema shape and reconciliation, but do NOT copy its fallback/default behavior.

Never:

- invent today's date when a date is absent;
- invent a generic hospital or claimant;
- silently replace missing fields with fake values;
- silently split combined charges;
- overwrite a source-declared total with a computed total.

Keep source-declared and computed values separate and surface discrepancies. -->


## Final acceptance criteria

The agent is done only when:

1. `policy.pdf` is preserved and hashed.
2. Clause inventory exists.
3. Every generated HIPML rule traces to source clause IDs.
4. The complete `.pml` parses successfully in the Vitraya service.
5. `/variables` returns the expected variables.
6. Representative `/run` fixtures pass.
7. Ambiguous/unrepresentable clauses are explicitly reported instead of guessed.
8. `variable-map.json` maps claim fields to every required variable.
9. No LLM-generated rule is accepted without parser + semantic validation.
