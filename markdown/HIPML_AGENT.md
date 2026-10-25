# ClaimSetu — HIPML Implementation Instructions for AI Agents

## Mission

Implement and verify the HIPML policy-evaluation layer for the ClaimSetu hackathon MVP.

ClaimSetu has two distinct layers:

- **HIPML:** deterministic representation/evaluation of selected policy rules.
- **RAG:** retrieval of original policy/regulatory text for explanations and ambiguous cases.

Do not merge these layers.

## Current MVP decision

Use Vitraya Technologies' `hipml-typescript` repository as a **standalone HTTP service**. Do **not** import it into the Next.js application and do not rewrite the HIPML parser for the MVP.

The verified public repository is an Express API with:

- `GET /pml/{pml_unique_id}/variables`
- `POST /pml/{pml_unique_id}/run`

It reads `[name].pml` from `app/pmls/` and uses the filename as the PML identifier.

The repository contains generated ANTLR TypeScript lexer/parser code. Treat it as the existing parser/runtime; ClaimSetu's job is to provide valid HIPML and valid variable inputs.

## Important repository/runtime constraint

The public repo is old. Its `package.json` uses:

- `express` 4.16.x
- `typescript` 3.1.x
- `antlr4ts` 0.5.0-alpha.3
- `antlr4ts-cli` 0.5.0-alpha.3
- `ts-node` 7.x
- `ts-node-dev` 1.0.0-pre.30
- `@types/node` 8.x
- several unrelated Angular/browser/testing dependencies

Do **not** upgrade or modernize this dependency tree during the hackathon unless the service cannot run.

Preferred runtime: isolate the service in Docker using an older Node image (Node 14 is the first fallback to try) so the main Next.js toolchain is unaffected.

Fallback only if the original repo cannot run: extract the generated grammar/parser pieces and build a minimal wrapper. This is a contingency, not the default path.

## HIPML data model

HIPML represents the **policy**, not the complete claim.

The claim remains a separate structured object containing things such as:

```text
patient
policy enrollment
hospitalization
billing line items
diagnoses
procedures
prescriptions
discharge summary
diagnostic reports
```

Only values required by the policy's HIPML variables are mapped into the HIPML execution input.

Correct flow:

```text
Policy PDF/text
  -> human/LLM-assisted HIPML authoring
  -> .pml file
  -> existing HIPML parser
  -> policy evaluation

Claim documents
  -> OCR/extraction
  -> structured Claim JSON
  -> Claim -> HIPML variable mapper
  -> POST /pml/{id}/run
```

The HIPML parser does **not** parse Claim JSON.

## PDF -> HIPML rule

Do not build an automatic arbitrary `PDF -> HIPML` compiler for the MVP.

For the hackathon:

1. Choose one real or representative health policy.
2. Extract/read the relevant policy clauses.
3. Hand-author the corresponding `.pml`, optionally using an LLM as a drafting assistant.
4. Validate every generated clause against the running HIPML service.
5. Keep only rules that can be demonstrated reliably within the hackathon scope.

LLM-generated HIPML is untrusted until the actual parser accepts it and the evaluation outputs are tested against known examples.

## First implementation steps

### 1. Run the existing service unchanged

Use the repository README example first. Verify:

```text
GET /pml/ABC123DEF456/variables
POST /pml/ABC123DEF456/run
```

Do not create a ClaimSetu policy before confirming the sample works.

### 2. Add one ClaimSetu policy

Create:

```text
app/pmls/claimsetu-mvp.pml
```

Keep the rule set intentionally small, e.g.:

- one procedure/service coverage rule
- one sub-limit
- one waiting-period/condition rule
- one exclusion
- one eligibility/admissibility condition

### 3. Verify variables

Call:

```text
GET /pml/claimsetu-mvp/variables
```

Record the exact variable names returned. The Next.js claim-to-HIPML mapper must use those exact names.

### 4. Verify execution

Call:

```text
POST /pml/claimsetu-mvp/run
```

with a small JSON object containing only the required variables.

Treat the returned `Coverage` and `Conditions` structures as the deterministic output used by ClaimSetu.

## Claim-to-HIPML bridge

The future Next.js backend should have a dedicated mapper, not ad-hoc field access spread throughout the app.

Conceptual shape:

```ts
function buildHipmlInputs(claim: Claim): Record<string, unknown> {
  return {
    "Sum Insured": claim.policy.sumInsured,
    "Policy inception Date": claim.policy.inceptionDate,
    "Hospitalization start date": claim.hospitalization.startDate,
    "Discharge Date": claim.hospitalization.endDate,
    // only variables actually required by the PML
  }
}
```

Do not send the entire claim JSON, raw PDF text, bill OCR, or arbitrary extra fields to `/run` unless the PML explicitly requires them.

## Testing strategy — mandatory

Testing is not just "the parser returns 200". Verify syntax **and semantics**.

Create a small fixture set and run them through HTTP.

### Test 1 — baseline parser

Known-good PML from Vitraya's repository.

Expected:

- service starts
- `/variables` succeeds
- `/run` succeeds
- coverage/conditions are returned

### Test 2 — ClaimSetu policy syntax

Your new `.pml` loads successfully through `/variables`.

### Test 3 — normal covered case

Use inputs expected to satisfy a coverage rule.

Verify:

```text
included = true
expected limit = known value
expected condition = true
```

### Test 4 — excluded case

Change only the relevant claim fact.

Verify the same policy now returns the expected exclusion/false condition.

### Test 5 — boundary case

Test exact thresholds:

```text
limit - 1
limit
limit + 1
```

Do this for at least one monetary limit or date/waiting-period rule.

### Test 6 — missing variable

Remove a required variable from the request.

Record the actual service behavior. Do not invent fallback semantics.

### Test 7 — malformed PML

Temporarily introduce a syntax error.

Confirm the service fails clearly enough to identify that the policy is invalid. Restore the valid file afterward.

### Test 8 — regression fixture

Keep the final valid PML and all important test inputs/expected outputs in a version-controlled test fixture so later agents can detect accidental rule changes.

## Testing principle

For every business rule, maintain a table like:

```text
Case             Inputs changed       Expected result
------------------------------------------------------
Covered          normal values        included=true
Excluded         exclusion fact       included=false
Boundary         exact threshold      exact expected limit
Over limit       amount > limit       known flag/result
```

The expected result should come from the policy/business rule you intentionally wrote, not from whatever the LLM happens to return.

## Dependency policy for this layer

Do not add LangChain, Langbase, an RAG framework, or an LLM SDK to the HIPML service.

The HIPML service should remain deterministic and HTTP-testable.

For the MVP, no database dependency is required inside the Vitraya HIPML service itself; policy files can remain in `app/pmls/`. PostgreSQL stores ClaimSetu metadata separately.

### RAG service dependencies later

When Track B begins, keep it as another small standalone Express + TypeScript service. Planned dependencies:

- `express` — HTTP API
- `typescript` — TypeScript
- `ts-node-dev` — development runner
- `pg` — PostgreSQL access / raw SQL
- `dotenv` — environment configuration
- `pdf-parse` — first-pass text extraction for text-native PDFs

Use direct `fetch` for embedding/LLM APIs rather than adding an SDK unless there is a concrete reason. Do not add LangChain or Langbase to the first RAG implementation.

## Integration contract with ClaimSetu

Day 1:

```text
HIPML service
  GET /pml/:id/variables
  POST /pml/:id/run
```

Day 2:

```text
Next.js backend
  -> fetch variables
  -> map Claim JSON to required variables
  -> call /run
  -> inspect Coverage + Conditions
  -> produce RetrievalNeed objects for flagged/ambiguous items
  -> call RAG service
```

The HIPML service must not call the RAG service.

The HIPML service must not call the LLM.

## Non-negotiable practices

- Keep HIPML evaluation deterministic.
- Keep policy files version-controlled for the MVP.
- Validate every generated PML with the real parser.
- Never let an LLM silently change executable policy rules.
- Do not put raw claim documents into HIPML.
- Do not put the whole claim JSON into HIPML unless the PML explicitly requires those variables.
- Do not build multi-policy/version infrastructure for the hackathon.
- Do not modernize the old Vitraya dependency tree unless necessary to make it run.
- Prefer a working isolated service over a theoretically cleaner rewrite.

## Definition of done

The HIPML layer is considered complete for MVP when:

1. The Vitraya sample PML runs successfully.
2. `claimsetu-mvp.pml` parses successfully.
3. Its variable list is documented.
4. A real Claim JSON can be mapped to those variables.
5. At least one covered, one excluded, and one boundary test pass.
6. The result can be consumed by the Next.js backend over HTTP.
7. No LLM is required to execute the policy.
