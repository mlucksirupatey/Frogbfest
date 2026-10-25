# ClaimSetu — Full Authentication + Member CSV + Claim Upload Implementation Plan

## 0. Goal

Implement the complete MVP flow:

```text
Insurer CSV
  -> members table
  -> policyholder login
  -> server-side member lookup
  -> eligible policy selection
  -> claim form upload
  -> multiple evidence upload
  -> document categorization
  -> OCR/PDF extraction
  -> unified claim
  -> HIPML
  -> RAG
  -> reasoning engine
  -> cached report
  -> result page
```

The insurer CSV replaces direct insurer-system integration for the MVP.

The CSV contains:

```csv
member_id,full_name,policy_id
```

Authentication still uses Auth.js/NextAuth and PostgreSQL.

---

# 1. Source-of-Truth Model

Use these responsibilities:

```text
users
  = authentication identity

members
  = insurer-provided membership registry

policies
  = available policies

policyholder_profile
  = link between ClaimSetu user and insurer member

claims
  = one logical claim

documents
  = files belonging to a claim
```

Do not put the insurer CSV directly into `users`.

Relationship:

```text
users
  |
  v
policyholder_profile
  |
  v
members
  |
  v
policies
```

Claim ownership:

```text
users -> claims.policyholder_user_id
```

---

1. The two SALICO policies already exist.
   - policy_id = 2
   - policy_id = 3
   - Do NOT create, seed, delete, or modify them.

2. Authentication is already complete.
   - Do NOT rebuild Auth.js.
   - Do NOT modify password handling, login, JWT, roles, or session configuration.
   - Only add the necessary database columns/foreign keys to connect an existing authenticated policyholder to the insurer member registry.

3. The implementation focus is therefore:
   existing auth
       ↓
   member_id linkage
       ↓
   insurer CSV synchronization
       ↓
   member → policy (2 or 3)
       ↓
   claim upload flow

# 2. PostgreSQL Schema

Use the project's existing `BIGSERIAL` / `BIGINT` convention.

## users

```sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL
      CHECK (role IN ('policyholder', 'institutional')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_users_email_lower
    ON users (LOWER(email));
```

Never store plaintext passwords.

Never infer role from email.

---

## members

This table is the insurer CSV registry.

```sql
CREATE TABLE members (
    id BIGSERIAL PRIMARY KEY,
    member_id TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    policy_id BIGINT NOT NULL
      REFERENCES policies(id)
      ON DELETE RESTRICT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    source TEXT NOT NULL DEFAULT 'insurer_csv',
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_members_policy_id
    ON members(policy_id);
```

`member_id` is the insurer-facing ID.

Do not use the login email as the member ID.

---

## policyholder_profile

Add the insurer member relationship:

```sql
ALTER TABLE policyholder_profile
ADD COLUMN member_id BIGINT
  REFERENCES members(id)
  ON DELETE SET NULL;

CREATE UNIQUE INDEX uq_policyholder_profile_member_id
  ON policyholder_profile(member_id)
  WHERE member_id IS NOT NULL;
```

Keep existing profile fields that are actually used.

Do not invent identity fields merely because the UI currently displays them.

---

## institutional_profile

Use the existing authentication design:

```sql
CREATE TABLE institutional_profile (
    user_id BIGINT PRIMARY KEY
      REFERENCES users(id)
      ON DELETE CASCADE,

    full_name TEXT NOT NULL,
    institution_name TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    job_title TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (institution_name, employee_id)
);
```

Institutional users are used for insurer-side operations such as member CSV import.

---

## claims ownership

Add:

```sql
ALTER TABLE claims
ADD COLUMN policyholder_user_id BIGINT
  REFERENCES users(id)
  ON DELETE SET NULL;

CREATE INDEX idx_claims_policyholder_user_id
  ON claims(policyholder_user_id);
```

A policyholder must only see claims where:

```sql
claims.policyholder_user_id = session.user.id
```

---

# 3. Mock Insurer CSV

Use this exact mock CSV for the MVP.

```csv
member_id,full_name,policy_id
MEM-9841-NP,Ram Bahadur Thapa,1
MEM-7284-NP,Bikash Gurung,1
MEM-5137-NP,Sita Devi Gurung,2
MEM-4412-NP,Prakash Adhikari,2
MEM-6629-NP,Anita Shrestha,1
MEM-3078-NP,Suman Karki,2
MEM-8154-NP,Nabin Tamang,1
MEM-2936-NP,Manisha Rai,2
MEM-5741-NP,Roshan KC,1
MEM-9362-NP,Sarita Gurung,2
```

All data is fake.

The first three members must remain:

```text
Ram Bahadur Thapa
Bikash Gurung
Sita Devi Gurung
```

---

# 4. Seed the Two SALICO Policies

The `policies` table must contain the two SALICO policies already selected for the MVP.

Use the exact policy names and HIPML filenames already present in the project.

Example relationships:

```text
policy id 1 -> SALICO policy A
policy id 2 -> SALICO policy B
```

Do not add a third policy just for testing.

Before importing the CSV, verify every `policy_id` referenced by the CSV exists.

---

# 5. Seed the Ten Users

The first three accounts must correspond to:

```text
Ram Bahadur Thapa
Bikash Gurung
Sita Devi Gurung
```

All policyholder demo accounts use the demo password:

```text
123456
```

but the database must contain only its Argon2id hash.

Suggested email pattern for fake seed data:

```text
ram.thapa@example.test
bikash.gurung@example.test
sita.gurung@example.test
prakash.adhikari@example.test
anita.shrestha@example.test
suman.karki@example.test
nabin.tamang@example.test
manisha.rai@example.test
roshan.kc@example.test
sarita.gurung@example.test
```

Create users only after their corresponding members have been imported.

Each policyholder account must point to its `members.id`.

---

# 6. Authentication Implementation

Replace the existing fake authorization implementation.

Current bad behavior that must be removed:

```text
- accepting arbitrary credentials
- synthetic user IDs
- email-pattern role inference
- client-controlled privilege
- hardcoded AUTH_SECRET fallback
```

Use Auth.js Credentials + JWT.

`authorize()` must:

```text
1. validate email/password
2. query users by email
3. require is_active = true
4. verify password with argon2.verify()
5. return real DB user id
6. return stored DB role
```

Conceptually:

```ts
const result = await pool.query(
  `
  SELECT id, email, password_hash, role, is_active
  FROM users
  WHERE LOWER(email) = LOWER($1)
  LIMIT 1
  `,
  [email]
);

const user = result.rows[0];

if (!user || !user.is_active) {
  return null;
}

const valid = await argon2.verify(user.password_hash, password);

if (!valid) {
  return null;
}

return {
  id: String(user.id),
  userId: String(user.id),
  email: user.email,
  role: user.role,
};
```

The submitted role must never determine authorization.

---

# 7. Password Hashing

Install:

```bash
npm install argon2
```

Hash:

```ts
const passwordHash = await argon2.hash(password, {
  type: argon2.argon2id,
});
```

Verify:

```ts
await argon2.verify(passwordHash, password);
```

Never log or return passwords/password hashes.

---

# 8. Auth.js Session

JWT should contain only:

```text
userId
role
email (optional)
```

Add TypeScript types for:

```ts
session.user.userId
session.user.role
token.userId
token.role
```

Use only:

```ts
type UserRole = 'policyholder' | 'institutional';
```

Do not use `insurer` or `adjudicator` as top-level auth roles.

Those can be represented by institutional profile/job information.

Require:

```env
AUTH_SECRET=...
```

Remove hardcoded fallback secrets.

---

# 9. Policyholder Registration

Registration must link the account to an existing insurer member.

Required MVP fields:

```text
email
password
member_id
```

plus whatever real profile fields the current product requires.

Transaction:

```text
BEGIN
  validate input
  find member by member_id
  reject unknown/inactive member
  hash password
  INSERT users
  INSERT policyholder_profile with member_id
COMMIT
```

Never allow the client to independently choose a policy ID.

The member registry determines policy eligibility.

---

# 10. Insurer CSV Import Endpoint

Create:

```text
POST /api/institutional/members/import
```

It must require:

```text
authenticated institutional user
```

Process:

```text
multipart CSV
  -> validate file
  -> parse headers
  -> validate rows
  -> verify policy IDs
  -> transaction
  -> upsert members
  -> deactivate missing snapshot members
  -> commit
```

Required headers:

```text
member_id
full_name
policy_id
```

Reject:

- missing headers
- blank member IDs
- blank names
- invalid policy IDs
- duplicate member IDs within one file
- malformed rows

---

# 11. CSV Synchronization Semantics

Treat the CSV as the insurer's current membership snapshot.

For each incoming row:

```text
existing member_id?
  yes -> update
  no  -> insert
```

Use an upsert:

```sql
INSERT INTO members (
    member_id,
    full_name,
    policy_id,
    is_active,
    source
)
VALUES ($1, $2, $3, TRUE, 'insurer_csv')
ON CONFLICT (member_id)
DO UPDATE SET
    full_name = EXCLUDED.full_name,
    policy_id = EXCLUDED.policy_id,
    is_active = TRUE,
    updated_at = NOW();
```

After import, members previously in the `insurer_csv` snapshot but absent from the new CSV should be:

```text
is_active = FALSE
```

Do not delete them.

Do not execute:

```sql
DELETE FROM members;
```

because historical claims may still reference the member.

---

# 12. Member Lookup

The claim page should be driven by a server component.

Recommended:

```text
/app/portal/claims/new/page.tsx
```

Server component:

```text
auth()
  -> session.user.id
  -> load policyholder profile
  -> load member
  -> load eligible policies
  -> pass props to client component
```

Conceptually:

```tsx
const session = await auth();

const context =
  await getCurrentPolicyholderContext(session.user.id);

return (
  <PolicyholderNewClaimClient
    member={context.member}
    policies={context.policies}
  />
);
```

Do not expose an unnecessary member lookup API if server-side loading already solves the problem.

---

# 13. Current Frontend Changes

The supplied component currently contains fake data:

```ts
mockUserPolicies[0]
```

and:

```ts
member = {
  memberId: "MEM-9841-NP",
  name: ...
}
```

Remove these in the real implementation.

Change to props:

```ts
type Props = {
  member: VerifiedMember;
  policies: ActivePolicy[];
};
```

Then initialize:

```ts
const [policy, setPolicy] =
  useState<ActivePolicy | null>(policies[0] ?? null);

const [claimForm, setClaimForm] =
  useState<AttachedClaimFile | null>(null);

const [evidenceFiles, setEvidenceFiles] =
  useState<SupportingFile[]>([]);
```

No mocked files should remain in the real submission flow.

---

# 14. Stage 1 — Member + Policy

Stage 1 displays:

```text
Member ID
Full name
Eligible policies
```

The member comes from the server.

The policies come from:

```text
members.policy_id -> policies.id
```

If the member later has multiple eligible policies, return all of them.

When the user selects a policy, the frontend stores it only as UI state.

The backend must verify eligibility again during submission.

---

# 15. Policy Tampering Protection

Never trust a posted `policy_id`.

Before creating/submitting the claim, verify:

```sql
SELECT 1
FROM members
WHERE id = $memberPk
  AND policy_id = $policyId
  AND is_active = TRUE;
```

The user cannot choose an arbitrary policy by editing browser state.

---

# 16. Stage 2 — Claim Form

Replace the hardcoded claim form file with actual upload.

Rules:

```text
one claim form
PDF or supported image
reasonable size limit
server-side validation
```

The document is stored as:

```text
claim_form
```

and associated with the claim.

---

# 17. Stage 3 — Multiple Supporting Evidence

Support multiple files.

MVP categories:

```text
bill
discharge_summary
prescription
diagnostic_report
other
```

The UI can present friendly labels:

```text
Hospital VAT Invoice -> Bill
Discharge Record     -> Discharge Summary
Doctor Rx            -> Prescription
```

Store canonical values in PostgreSQL:

```text
bill
discharge_summary
prescription
diagnostic_report
other
```

Do not create separate database types such as:

```text
vat_invoice
tax_invoice
hospital_bill
```

for synonyms.

---

# 18. Frontend Evidence File Type

Extend the existing `SupportingFile` model:

```ts
type ClaimDocumentType =
  | "claim_form"
  | "bill"
  | "discharge_summary"
  | "prescription"
  | "diagnostic_report"
  | "other";

type SupportingFile = {
  id: string;
  name: string;
  size: string;
  type: string;
  category: ClaimDocumentType | null;
  detectedCategory?: ClaimDocumentType | null;
  detectionReason?: string | null;
  uploadStatus?: "pending" | "uploaded" | "processing" | "ready" | "error";
};
```

---

# 19. Evidence Categorization Strategy

Do not build a heavy AI classifier for the MVP.

Use this order:

```text
1. User-selected category
2. Filename heuristic
3. Extracted-text heuristic
4. other / manual review
```

Filename examples:

```text
Mediciti_VAT_Invoice_781.pdf
    -> bill

Hospital_Tax_Invoice.pdf
    -> bill

Discharge_Summary_Sheet.pdf
    -> discharge_summary

Prescription_DrSharma.jpg
    -> prescription

Claim_Form_Signed.pdf
    -> claim_form
```

A scan called:

```text
scan_9381.pdf
```

should initially be:

```text
other
```

unless its extracted content identifies it.

---

# 20. Frontend Category UX

When a file is selected:

```text
file
 -> detect category
 -> display category
 -> allow correction
```

Example:

```text
Mediciti_VAT_Invoice_781.pdf

Detected: BILL

Category: [ BILL v ]
```

Unknown:

```text
scan_9381.pdf

Detected: OTHER

Category: [ Choose type v ]
```

Stage 4 should display the final categories before submission.

---

# 21. Upload + Deduplication

For every file:

```text
SHA-256
  -> check claim_id + file_hash
  -> if duplicate: reuse existing document/extraction
  -> if new: upload to MinIO + create documents row
```

Existing constraint:

```sql
UNIQUE(claim_id, file_hash)
```

The same file may exist across different claims, but within one claim it must not be duplicated.

Dedup is based on bytes/hash, not filename.

---

# 22. PDF / OCR Processing

Use the existing extraction helpers.

Flow:

```text
image
  -> Tesseract eng+nep

text PDF
  -> PDF parser

scanned PDF
  -> OCR fallback
```

Do not create another OCR Docker container if Tesseract is already installed.

Keep raw extracted text.

Do not invent missing values.

Bad:

```text
missing discharge date -> guessed date
```

Good:

```json
{
  "dischargeDate": null,
  "extractionFlags": ["DISCHARGE_DATE_NOT_FOUND"]
}
```

---

# 23. Document Extraction

Each file gets document-specific structured data.

Bill example:

```json
{
  "documentType": "bill",
  "hospitalName": "...",
  "invoiceNumber": "...",
  "declaredTotal": 85000,
  "lineItems": []
}
```

Prescription:

```json
{
  "documentType": "prescription",
  "doctorName": "...",
  "diagnoses": [],
  "medications": []
}
```

Discharge summary:

```json
{
  "documentType": "discharge_summary",
  "hospitalName": "...",
  "admissionDate": null,
  "dischargeDate": null,
  "diagnosis": [],
  "procedures": []
}
```

Claim form:

```json
{
  "documentType": "claim_form"
}
```

Exact schemas should follow the existing extraction implementation rather than being duplicated unnecessarily.

---

# 24. Unified Claim

One logical claim can contain:

```text
claim form
bill 1
bill 2
prescription
discharge summary
diagnostic report
```

There must still be:

```text
ONE claims row
MANY documents rows
```

Aggregate extraction into the unified:

```text
claims.structured_data
```

and use:

```text
claim_bill_items
```

for normalized bill line items where appropriate.

---

# 25. Existing Claim POST Endpoint

The backend claim POST endpoint already exists.

Do not replace it unnecessarily.

Extend it only to accept the real:

```text
member/policy/document
```

relationship and ensure ownership/eligibility checks are server-side.

Expected submission data should identify:

```text
selected policy
claim form
supporting evidence
```

The authenticated user comes from Auth.js, not the request body.

---

# 26. Submit Pipeline

After Stage 4 submit:

```text
POST existing claim endpoint
  -> create claim
  -> associate authenticated policyholder
  -> associate selected policy
  -> associate uploaded documents
  -> return claimId
```

Then:

```text
claimId
  -> run processing engine
```

Do not let the browser directly call:

```text
HIPML
RAG
Gemini
Postgres
MinIO
```

Only the Next.js backend should orchestrate those systems.

---

# 27. Processing Engine

The engine should execute:

```text
1. Load claim
2. Load documents
3. Reuse cached extraction where possible
4. Build unified claim JSON
5. Map fields -> HIPML variables
6. Run HIPML
7. Generate RetrievalNeeds
8. Query RAG
9. Freeze evidence package
10. Call reasoning LLM
11. Validate evidence references
12. Persist results
13. Mark completed
```

The reasoning model is not the adjudicator.

HIPML remains deterministic.

---

# 28. RAG Rule

Do not let reasoning independently retrieve documents.

Correct:

```text
HIPML findings
   -> RetrievalNeeds
   -> RAG
   -> frozen evidence
   -> reasoning LLM
```

RAG should mainly explain:

```text
excluded items
borderline items
sublimit violations
waiting periods
pre-existing conditions
coverage exclusions
claim admissibility issues
```

Do not retrieve every claim field blindly.

---

# 29. Evidence Freeze

Create controlled evidence IDs:

```text
E1
E2
E3
```

Internally:

```text
E1 -> chunkId/documentId/clause/page
E2 -> ...
```

The reasoning LLM may return:

```json
{
  "evidence_refs": ["E1", "E3"]
}
```

Validate those IDs before displaying the report.

The model must not invent citation metadata.

---

# 30. Processing State

Use a claim processing state:

```text
pending
processing
completed
failed
```

A completed claim should return its cached result.

If a new document is attached after completion:

```text
mark result stale
-> process again
```

Do not unnecessarily rerun OCR/RAG/LLM on unchanged claims.

---

# 31. Concurrent Processing Protection

Use a conditional state change:

```sql
UPDATE claims
SET processing_status = 'processing',
    updated_at = NOW()
WHERE id = $1
  AND processing_status IN ('pending', 'failed')
RETURNING id;
```

This prevents two browser clicks from triggering two simultaneous runs.

Do not hold a DB transaction open while calling Gemini/OCR/RAG.

---

# 32. Status Endpoint

Create:

```text
GET /api/claims/:id/status
```

Response:

```json
{
  "claimId": "123",
  "status": "processing",
  "reasoningAvailable": false
}
```

Possible states:

```text
pending
processing
completed
failed
```

The result page can poll.

Do not introduce WebSockets for the MVP unless already required.

---

# 33. Processing Endpoint

Create/use:

```text
POST /api/claims/:id/process
```

Rules:

```text
completed  -> return cached result
processing -> return current state
pending    -> start processing
failed     -> retry
```

Ensure only authorized users/processes can invoke it.

---

# 34. Result Page

Create:

```text
/portal/claims/[id]/result
```

Prefer a server-rendered page.

Verify claim ownership before loading results.

For a policyholder:

```sql
SELECT *
FROM claims
WHERE id = $1
  AND policyholder_user_id = $2;
```

---

# 35. Result UI

Keep it simple and user-readable:

```text
Claim Review Result

STATUS

Claim ID
Member
Policy

---------------------------

Summary

Short explanation.

---------------------------

Deterministic Findings

✓ ...
⚠ ...
✗ ...

---------------------------

Evidence

E1 — Policy clause...
E2 — Bill...
E3 — Discharge summary...

---------------------------

Detailed Reasoning Report

Full report

---------------------------

Open Questions / Human Review

...
```

Do not expose raw internal JSON as the main UI.

---

# 36. Cached Result UI

When `/result` is opened:

```text
completed?
  -> show stored report immediately

processing?
  -> show processing state and poll

failed?
  -> show error + retry

pending?
  -> begin/wait for processing
```

A page reload must not automatically launch another expensive engine run if a valid cached report already exists.

---

# 37. Important Security Rules

Never:

```text
infer role from email
trust client user ID
trust client member_id
trust client policy_id
store plaintext password
let policyholder access another user's claim
let LLM override HIPML
let LLM invent evidence
delete old members during CSV sync
delete claims when members become inactive
```

Server authorization must always be based on:

```text
Auth.js session
+
database relationships
```

---

# 38. Testing

## Auth

Verify:

```text
correct login -> success
wrong password -> failure
unknown email -> failure
inactive account -> failure
```

## Required users

Verify first three:

```text
Ram Bahadur Thapa
Bikash Gurung
Sita Devi Gurung
```

can log in with the demo password.

## Role spoof

Policyholder submits:

```json
{ "role": "institutional" }
```

Session must remain:

```text
policyholder
```

## CSV

Upload the 10-row CSV:

```text
10 members
no duplicate IDs
all policy IDs valid
```

Upload it again:

```text
no duplicate members
```

Change one policy and re-import:

```text
member policy updates
```

Remove one member from the next CSV:

```text
member becomes inactive
member is not deleted
historical claims remain
```

## Claim access

User A must not be able to access User B's claim.

## Policy tampering

A member linked to Policy 1 cannot submit Policy 2 unless the member registry actually allows Policy 2.

## Uploads

Verify:

```text
claim form -> claim_form
VAT/tax invoice -> bill
discharge summary -> discharge_summary
prescription -> prescription
```

## Dedup

Upload identical bytes twice:

```text
one document
one stored object
one extraction
```

## Engine

Verify:

```text
claim submitted
-> processing
-> completed
-> result page
```

Reload result:

```text
cached result
```

Do not rerun the entire engine.

---

# 39. Suggested Code Structure

Reuse existing project structure where possible.
Auth already exists. Don't change the folder structure for that.

A sensible organization is:

```text
src/
  lib/
    auth/
      auth.ts
      passwords.ts

    db/
      pool.ts

    members/
      member-service.ts
      member-import.ts

    claims/
      claim-service.ts
      claim-processing.ts
      document-service.ts
      document-classifier.ts
      document-extractor.ts

    hipml/
      hipml-client.ts
      variable-mapper.ts

    rag/
      rag-client.ts
      retrieval-planner.ts

    reasoning/
      reasoning-engine.ts

    storage/
      minio.ts

  app/
    api/
      auth/register/route.ts

      institutional/
        members/import/route.ts

      claims/
        [id]/
          documents/route.ts
          process/route.ts
          status/route.ts
          result/route.ts

    portal/
      claims/
        new/
          page.tsx
          PolicyholderNewClaimClient.tsx

        [id]/
          result/
            page.tsx
```

Do not duplicate services that already exist.

---

# 40. Implementation Order

## Phase 1 — Database

```text
1. Inspect current schema.
2. Create members.
3. Link policyholder_profile -> members.
4. Add claims.policyholder_user_id.
5. Verify two SALICO policies.
6. Apply constraints/indexes.
```

Checkpoint:

```text
member -> policy
user -> member
claim -> user
```

all work.

---

## Phase 2 — Data

```text
1. Import mock CSV.
2. Seed 10 user accounts.
3. Hash 123456 with Argon2id.
4. Link all users to members.
```

Checkpoint:

```text
first 3 users can log in.
```

---

## Phase 3 — Auth

```text
1. Replace fake authorize().
2. DB lookup.
3. Argon2 verification.
4. DB-backed role.
5. JWT/session types.
6. Require AUTH_SECRET.
7. Test spoofing/inactive users.
```

Checkpoint:

```text
real authentication works.
```

---

## Phase 4 — CSV Sync

```text
1. Institutional-only upload route.
2. CSV validation.
3. policy FK validation.
4. upsert.
5. deactivate absent members.
6. import summary.
```

Checkpoint:

```text
repeated import is idempotent.
```

---

## Phase 5 — Claim Page

```text
1. Make new-claim page server-side.
2. auth()
3. get current member.
4. get eligible policies.
5. pass props to client.
6. remove all mock member/policy data.
```

Checkpoint:

```text
claim page displays real CSV-backed member.
```

---

## Phase 6 — Uploads

```text
1. Real claim form upload.
2. Multiple evidence upload.
3. SHA-256.
4. MinIO.
5. documents rows.
6. deduplication.
7. category field.
```

Checkpoint:

```text
one claim + multiple documents works.
```

---

## Phase 7 — Classification + Extraction

```text
1. Filename heuristic.
2. User correction UI.
3. PDF parser.
4. image OCR.
5. scanned-PDF OCR fallback.
6. content-based classification when needed.
7. structured extraction.
8. unified claim aggregation.
```

Checkpoint:

```text
sample claim produces reliable unified JSON.
```

---

## Phase 8 — Engine

```text
1. Processing state.
2. claim processing service.
3. HIPML variables.
4. HIPML run.
5. RetrievalNeeds.
6. RAG.
7. Evidence freeze.
8. reasoning.
9. persistence.
10. caching/retry.
```

Checkpoint:

```text
one submitted claim -> completed report.
```

---

## Phase 9 — Result UI

```text
1. server-side ownership check.
2. status handling.
3. polling.
4. cached result.
5. summary.
6. deterministic findings.
7. evidence.
8. detailed report.
9. retry failed processing.
```

---

# 41. Final End-to-End Demo

Use:

```text
Ram Bahadur Thapa
MEM-9841-NP
```

Demo sequence:

```text
1. Insurer imports CSV.
2. Ram logs in.
3. Claim page looks up Ram server-side.
4. Correct policy is displayed.
5. Ram selects policy.
6. Uploads claim form.
7. Uploads:
   Mediciti_VAT_Invoice_781.pdf
   Prescription_DrSharma.jpg
   Discharge_Summary_Sheet.pdf
8. UI categorizes:
   bill
   prescription
   discharge_summary
9. Ram reviews.
10. Submit.
11. Existing claim endpoint creates claim.
12. Processing engine starts.
13. OCR/PDF extraction.
14. Claim aggregation.
15. HIPML evaluation.
16. RAG retrieval for flagged findings.
17. Reasoning report.
18. Result page displays summary/report.
19. Refresh page.
20. Cached report is displayed without rerunning the engine.
```

---

# 42. Definition of Done

Authentication:

```text
✓ PostgreSQL users
✓ Argon2id
✓ Auth.js login/logout
✓ database-backed roles
✓ policyholder/institutional roles
```

Insurer integration:

```text
✓ member CSV import
✓ validation
✓ synchronization
✓ inactive member handling
✓ policy FK validation
```

Claim entry:

```text
✓ server-side member lookup
✓ real eligible policies
✓ no mock member/policy
✓ claim form upload
✓ multiple evidence uploads
✓ document category selection
```

Processing:

```text
✓ PDF extraction
✓ OCR
✓ unified claim JSON
✓ HIPML
✓ RAG
✓ frozen evidence
✓ reasoning
✓ cached report
✓ retry
```

Security:

```text
✓ authenticated APIs
✓ resource ownership
✓ policy eligibility checks
✓ no role spoofing
✓ no plaintext passwords
✓ no client-controlled ownership
```

---

# 43. Agent Rules

Before coding:

```text
1. Inspect the current schema.
2. Inspect auth.ts.
3. Inspect the existing claim POST endpoint.
4. Inspect current document upload logic.
5. Inspect current OCR/PDF extraction.
6. Reuse existing working code.
```

Do not rewrite working infrastructure merely to match this document.

Make the implementation incremental:

```text
database -> data -> auth -> member lookup -> uploads -> extraction -> engine -> result UI
```

Verify each checkpoint before moving on.

Do not add OAuth, 2FA, password reset, WebSockets, enterprise IAM, or a sophisticated AI classifier unless explicitly requested.

