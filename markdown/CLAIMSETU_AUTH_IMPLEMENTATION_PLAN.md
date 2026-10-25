# ClaimSetu Authentication — Agent Implementation Plan (v2, MVP-simplified)

## Objective

Implement the MVP authentication system for ClaimSetu using:

- Next.js App Router
- Auth.js / NextAuth
- Credentials provider
- JWT sessions
- PostgreSQL
- **Raw (plaintext) password comparison — no hashing, for this MVP only**

Two top-level roles, unchanged from before:

```text
policyholder
institutional
```

Do not use `insurer` or `adjudicator` as top-level auth roles — represent those as institutional profile fields if the UI needs them.

---

## ⚠ MVP Security Simplification — read once, applies throughout

Passwords are stored and compared as plaintext, deliberately, for development simplicity. This is acceptable only because this MVP runs against synthetic/mock data (test accounts, mock PAN and NIA license numbers). **Do not point this auth system at real policyholder PII or deploy it anywhere it might be mistaken for production.** Everything else security-relevant in the original plan — ownership checks, role-spoofing resistance, `AUTH_SECRET` — stays exactly as strict as before. This is a scoped simplification, not a general relaxation.

---

## 1. Read the Existing Code First

Before editing anything, inspect:

```text
src/auth.ts (or current path)
current database connection/pool module
existing schema.sql / schema.md / migrations
existing claims table
existing policies table
existing institutions table   <- already seeded (Shikhar, SALICO); do not recreate
login page
registration page, if one exists
protected claim API routes
TypeScript Auth.js type declarations, if any
```

Do not rewrite unrelated ClaimSetu services. Confirm actual table/column names before writing SQL. The project uses `BIGSERIAL` / `BIGINT` consistently — keep that.

---

## 2. Target Data Model

```text
users
├── policyholder_profile ──> policies (existing, seeded)
└── institutional_profile ──> institutions (existing, seeded)

users 1 ─── 0..1 policyholder_profile
users 1 ─── 0..1 institutional_profile
users 1 ─── many claims
```

Auth.js handles session state. PostgreSQL remains the source of truth for identity, role, password, and profile data. No Auth.js adapter/session tables — Credentials + JWT only.

**Key correction from the original draft**: `institutional_profile` links to the real, already-seeded `institutions` table by ID — it does not store a free-text institution name that could drift out of sync with existing policies/claims data.

---

## 3. Database Migration

### 3.1 users

```sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    password TEXT NOT NULL,   -- plaintext, MVP only — see flag above
    role TEXT NOT NULL
        CHECK (role IN ('policyholder', 'institutional')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_users_email_lower ON users (LOWER(email));
```

Rules (unchanged): email uniqueness is case-insensitive; never infer role from email; never trust a role sent by the browser.

### 3.2 policyholder_profile

```sql
CREATE TABLE policyholder_profile (
    user_id BIGINT PRIMARY KEY
        REFERENCES users(id) ON DELETE CASCADE,

    full_name TEXT NOT NULL,

    policy_id BIGINT NOT NULL
        REFERENCES policies(id),   -- existing, seeded policies table

    insurance_provider TEXT NOT NULL
        CHECK (insurance_provider IN ('salico_micro', 'salico', 'shikhar')),

    pan_id TEXT NOT NULL,   -- mock value for MVP, not validated beyond basic format

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_policyholder_profile_policy_id ON policyholder_profile(policy_id);
```

Dropped from the original draft: `date_of_birth`, `phone`, `address` — not in the current required field list. Add them back only if the frontend actually needs them.

**Known MVP simplification**: `insurance_provider` and `policy_id` are stored independently and are not cross-validated against each other (i.e. nothing currently checks that the selected provider actually owns that policy_id's institution). Fine for a demo; flag before any real use.

### 3.3 institutional_profile

```sql
CREATE TABLE institutional_profile (
    user_id BIGINT PRIMARY KEY
        REFERENCES users(id) ON DELETE CASCADE,

    institution_id BIGINT NOT NULL
        REFERENCES institutions(id),   -- existing, seeded (Shikhar, SALICO)

    pan_number TEXT NOT NULL,          -- mock value for MVP
    nia_license_number TEXT NOT NULL,  -- mock value for MVP

    -- Filled in later via /insurer/profile, not at registration:
    full_name TEXT,
    employee_id TEXT,
    job_title TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Registration requires `institution_id`, `pan_number`, `nia_license_number` only. The registration UI's "institutional name" field is a **dropdown populated from the existing `institutions` table** — not free text — so every new institutional user is tied to a real, already-seeded insurer.

### 3.4 claim ownership — unchanged

```sql
ALTER TABLE claims
ADD COLUMN policyholder_user_id BIGINT
    REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_claims_policyholder_user_id ON claims(policyholder_user_id);
```

No `ON DELETE CASCADE` here — deleting a user must not delete a claim record.

---

## 4. Dependency Setup

```bash
npm install zod   # if not already present
```

No `argon2` needed for this MVP. Do not introduce an ORM only for authentication.

---

## 5. Shared User Role Type — unchanged

```ts
export type UserRole = "policyholder" | "institutional";
```

---

## 6. Password Handling (raw comparison, not hashing)

Create `src/lib/auth/password.ts` anyway, even though it's trivial — keeps the comparison logic in one tested, swappable place rather than inlined in `auth.ts`, so upgrading to real hashing later is a one-file change.

```ts
export function verifyPassword(stored: string, submitted: string): boolean {
  return stored === submitted;
}
```

Do not log passwords. Plaintext in the DB is accepted for this MVP; plaintext in logs is not.

---

## 7. Registration API

`POST /api/auth/register`. If a registration route already exists, modify it rather than duplicating.

### 7.1 Zod validation — deliberately minimal

```ts
import { z } from "zod";

export const policyholderRegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4), // minimal — MVP only
  full_name: z.string().min(1),
  policy_id: z.coerce.number().int().positive(),
  insurance_provider: z.enum(["salico_micro", "salico", "shikhar"]),
  pan_id: z.string().min(1),
});

export const institutionalRegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
  institution_id: z.coerce.number().int().positive(),
  pan_number: z.string().min(1),
  nia_license_number: z.string().min(1),
});
```

No format-checking on `pan_id`, `pan_number`, or `nia_license_number` beyond "non-empty" — these are mock values by design, not real identifiers to validate.

### 7.2 Transaction — unchanged in structure

```text
BEGIN
  validate (Zod)
  check duplicate email
  INSERT users (password stored as-is, no hashing)
  INSERT matching profile
COMMIT
```

Roll back on any error. A `users` row must never exist without its required profile.

### 7.3 Return value — unchanged

Never return `password` in any API response, even though it's not hashed — same rule as before, just a different field name to watch for.

---

## 8. Replace the Current Auth.js `authorize()` Logic

Same required behavior as before — no arbitrary credentials, no synthetic IDs, no role inference from email, no role-from-client-request, no hardcoded secret — **only the verification step changes**:

```ts
const result = await pool.query(
  `SELECT id, email, password, role, is_active
   FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
  [email]
);

const user = result.rows[0];

if (!user || !user.is_active) {
  return null;
}

if (!verifyPassword(user.password, password)) {
  return null;
}

return {
  id: String(user.id),
  userId: String(user.id),
  email: user.email,
  role: user.role,
};
```

The same role-spoofing attack from the original plan must still fail: a submitted `role: "institutional"` on a real policyholder account must still produce a `policyholder` session, because the role always comes from the DB row, never the request body.

---

## 9. JWT and Session Callbacks — unchanged

Same shape as the original plan: `userId`, `role`, optional `email` in the JWT; same session callback; same TypeScript module augmentation for `Session.user.id/userId/role` and `JWT.userId/role`.

---

## 10. Auth Configuration / Secret — **unchanged, do not weaken this**

```ts
session: { strategy: "jwt" }
```

```env
AUTH_SECRET=...
```

Remove any hardcoded fallback (`process.env.AUTH_SECRET || "hardcoded-secret"`). The app must fail configuration validation if `AUTH_SECRET` is missing. Never commit the actual secret. This section is explicitly preserved as originally planned — relaxing password storage does not extend to relaxing this.

---

## 11–12. Session Usage & Authorization Rules — unchanged

Protected routes still call `auth()` and reject with 401 if there's no session. Policyholder claim ownership is still enforced in the SQL `WHERE` clause (`AND policyholder_user_id = $2`), never assumed after a generic fetch. Institutional authorization still follows whatever specific permissions the existing app already defines — not a blanket `institutional === true`.

---

## 13. Profile Loading — updated to the new fields

```sql
-- policyholder
SELECT u.id, u.email, u.role,
       p.full_name, p.policy_id, p.insurance_provider, p.pan_id
FROM users u
JOIN policyholder_profile p ON p.user_id = u.id
WHERE u.id = $1;

-- institutional
SELECT u.id, u.email, u.role,
       p.institution_id, i.name AS institution_name,
       p.pan_number, p.nia_license_number,
       p.full_name, p.employee_id, p.job_title
FROM users u
JOIN institutional_profile p ON p.user_id = u.id
JOIN institutions i ON i.id = p.institution_id
WHERE u.id = $1;
```

Still never put the full profile in the JWT — load it from Postgres when a route needs it.

---

## 14. Protect Existing APIs — unchanged list, add the new route

Same checklist as before (claim creation, retrieval, document upload/listing, status, policyholder profile endpoints, institutional claim-processing endpoints) — plus the new `/insurer/profile` route below.

---

## 15. NEW — `/insurer/profile` (two-stage institutional profile)

Registration collects only `institution_id`, `pan_number`, `nia_license_number`. Everything else about the institutional user — `full_name`, `employee_id`, `job_title` — is completed after first login, on its own page.

**`GET /api/insurer/profile`** — requires an `institutional` session. Returns the joined profile (§13 query above). If `full_name`/`employee_id`/`job_title` are null, the frontend should treat the profile as incomplete and prompt the user to fill it in.

**`PATCH /api/insurer/profile`** — requires an `institutional` session. Updates only the stage-2 fields for the session's own `user_id` — never accept a `user_id` from the request body.

```ts
export const insurerProfileUpdateSchema = z.object({
  full_name: z.string().min(1),
  employee_id: z.string().min(1),
  job_title: z.string().min(1),
});
```

```sql
UPDATE institutional_profile
SET full_name = $1, employee_id = $2, job_title = $3, updated_at = NOW()
WHERE user_id = $4;
```

`user_id = $4` comes from `session.user.userId`, never from the request body — same ownership rule as everywhere else in this plan.

---

## 16. Claim Creation and Ownership — unchanged

Ownership still derives from `session.user.userId`, never from a client-supplied `policyholder_user_id`.

---

## 17. Migration / Existing Data Handling

`institutions` and `policies` are already seeded — this migration only adds the auth tables and the foreign keys into them, it does not recreate or modify seed data. If auth tables are currently empty, create them directly. If old mock/synthetic auth data exists in some other shape, write a deterministic migration rather than guessing at passwords or roles.

---

## 18. Frontend Login — unchanged in structure

Role selector in the UI is a hint only; the server-side role always comes from the DB.

## 19. Frontend Registration — updated field lists

**Policyholder**: email, password, full name, policy ID, insurance provider (salico micro insurance company(synthetic) / SALICO / Shikhar), PAN ID.

**Institutional**: email, password, institution (dropdown, populated from the existing `institutions` table — not free text), PAN number, NIA license number. `full_name` / `employee_id` / `job_title` are **not** on this form — they're collected later on `/insurer/profile`.

---

## 20. Testing Plan

### 20.1 Database tests
Same structural checks as before (case-insensitive email uniqueness, invalid role rejection, profile PK=FK, claim ownership FK, cascade/set-null behavior on user deletion) **plus**:
- `institutional_profile.institution_id` actually references a row in the existing `institutions` table (not an arbitrary integer).
- `policyholder_profile.policy_id` actually references a row in the existing `policies` table.

### 20.2 Registration tests

**Policyholder**: valid registration → 1 `users` row, 1 `policyholder_profile` row, `role = policyholder`, **password stored as submitted (plaintext, not hashed)**.

**Institutional**: valid registration → 1 `users` row, 1 `institutional_profile` row with `full_name`/`employee_id`/`job_title` all `NULL`, `role = institutional`, password plaintext.

**Duplicate email** (`Alice@example.com` then `alice@example.com`) → second registration rejected.

**Partial failure** → forced profile-insert failure still rolls back the `users` row.

### 20.3 Login tests
Same set as before (correct password, wrong password, unknown email, inactive account, case-insensitive email, role-spoofing attempt) — only the verification mechanism changed, the expected pass/fail outcomes are identical.

### 20.4 Insurer profile completion test
Register institutional user → `GET /api/insurer/profile` shows null stage-2 fields → `PATCH` with valid data → `GET` again shows the update → attempt `PATCH` while unauthenticated → 401.

### 20.5 Authorization tests — unchanged
Cross-user claim access must fail; unauthenticated requests get 401; institutional-only endpoints reject policyholder sessions.

---

## 21. Security Review Before Completion

Search for and remove:
```text
email.includes("admin") / "insurer" / "adjudicator"
role derived from request body
synthetic user IDs
hardcoded AUTH_SECRET
full profile embedded in JWT
authorization based only on frontend UI
claim lookup without ownership condition
user_id accepted from request body instead of session (incl. /insurer/profile PATCH)
```

**Not** on this list anymore, by explicit design: plaintext password storage. It's expected here — just make sure it stays confined to this MVP and is never mistaken for a production-ready pattern.

---

## 22. Scope Control — unchanged

Still explicitly out of scope unless the app already depends on it: OAuth/social login, email verification, password reset, 2FA, magic links, Auth.js DB adapter sessions, complex RBAC, multi-tenant org model, multi-policy enrollment, refresh tokens.

---

## 23. Implementation Order

```text
1. Inspect existing auth, DB, claims, policies, institutions, login/registration code.
2. Confirm PostgreSQL ID conventions.
3. Create DB migration (users, policyholder_profile, institutional_profile, claims.policyholder_user_id).
4. Install zod if missing.
5. Add shared UserRole type.
6. Add password.ts (plain comparison).
7. Add Zod schemas (registration x2, insurer profile update).
8. Implement/repair registration API (institution_id and policy_id as FK-validated dropdown selections on the frontend).
9. Replace Auth.js authorize() with DB-backed plaintext verification.
10. Remove role inference and synthetic IDs.
11. Add JWT/session TypeScript augmentation.
12. Confirm AUTH_SECRET is env-configured, no hardcoded fallback.
13. Build /api/insurer/profile GET + PATCH.
14. Update login UI.
15. Update registration UI (policyholder + institutional forms, institution dropdown).
16. Build /insurer/profile page.
17. Protect server APIs; enforce claim ownership in DB queries.
18. Run database tests.
19. Run registration tests.
20. Run login/session tests.
21. Run insurer-profile-completion tests.
22. Run authorization/IDOR tests.
23. Run TypeScript/build/lint/tests.
24. Review final diff for unrelated changes.
```

---

## 24. Definition of Done

```text
[ ] users, policyholder_profile, institutional_profile tables exist
[ ] institutional_profile.institution_id FKs into the existing, seeded institutions table
[ ] policyholder_profile.policy_id FKs into the existing, seeded policies table
[ ] Claims have policyholder ownership
[ ] Passwords stored and compared as plaintext (deliberate MVP simplification, documented)
[ ] Registration is transactional
[ ] Duplicate emails are rejected
[ ] Login checks DB credentials
[ ] Inactive accounts cannot log in
[ ] Role comes only from DB; client role spoofing fails
[ ] Auth.js JWT sessions work
[ ] session.user.userId and session.user.role exist server-side
[ ] AUTH_SECRET is environment-configured, no hardcoded fallback
[ ] Protected APIs require authentication
[ ] Policyholder claim ownership is enforced; cross-user access fails
[ ] Institutional-only endpoints reject policyholders
[ ] /insurer/profile GET/PATCH work and are session-scoped, not request-body-scoped
[ ] No synthetic user IDs; no email-pattern role inference
[ ] TypeScript build passes
[ ] Existing ClaimSetu claim/RAG/HIPML functionality remains intact
```

---

## 25. Agent Working Rules — unchanged

1. Inspect before changing — use existing structure/DB connection, don't invent parallel infrastructure.
2. Keep the change isolated — auth work should not require touching HIPML, RAG, OCR, or document ingestion.
3. `users.id` is the canonical application user ID.
4. Trust the database, not the browser, for authorization decisions.
5. Don't invent missing data — surface issues with existing data rather than assigning fake values.
6. Test every security boundary that's still in scope here: role spoofing, cross-user claim access, session-vs-request-body ownership on `/insurer/profile`.
7. Report the final diff, migration files, and test results explicitly.
