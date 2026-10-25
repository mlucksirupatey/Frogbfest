# Agent Context & Engineering Guidelines: ClaimSetu

## 1. Project Overview & Core Mission
**ClaimSetu** is an automated health claims adjudication and validation platform built specifically for Nepal's health insurance ecosystem. It bridges the gap between citizens (patients), healthcare providers (hospitals), and insurance companies (e.g., Shikhar Insurance, SALICO).

### The Real-World Bottleneck:
- **Statutory Mandate:** Nepal's Insurance Act 2079 (Section 123) and the NIA Claim Payment Guideline 2081 legally mandate claim settlement within **30 days**. Insurers who miss this window owe claimants roughly **10% interest penalty** on the delayed amount.
- **The Problem:** Claims still move as unstructured physical paper (Nepali VAT invoices, handwritten doctor prescriptions, and physical discharge sheets). Insurers settle late and regulators are overwhelmed (NIA resolved only ~28.9% of complaints, leaving a 386+ case backlog).
- **The Solution:** A dual-engine pipeline:
  1. **Bilingual OCR:** Fast extraction from English and Nepali Devanagari invoices and prescriptions.
  2. **Deterministic Rules Engine:** Pure logic mathematical validation (co-pays, room rent limits, policy exclusion lists) with **0% LLM guesswork**.
  3. **RAG Regulatory Reasoning:** Grounded retrieval against NIA directives and specific policy clauses for explainable, clause-cited dispute and appeal generation.

---

## 2. Portal Architecture & URL Routes
The application is strictly split into two parallel gateways using Next.js App Router:

### A. Marketing / Public
- `/` → High-converting SaaS Landing Page (Hero, Dual Gateways, Architecture, Statutory Penalty Banner).

### B. Policyholder / Citizen Portal (`/portal`)
- `/portal` → **Dashboard:** Overview of active policies, remaining Sum Insured, 30-day statutory countdown timer, and claim history table.
- `/portal/claims/new` → **New Claim Ingestion:** 4-document upload interface (Hospital VAT Bills, Doctor's Prescription, Discharge Summary, Claim Form) with live pre-submission scrubber.
- `/portal/claims/[id]` → **Claim Status & Dispute View:** Itemized deduction transparency and one-click clause-cited NIA appeal generator.

### C. Insurer / Institutional Cockpit (`/insurer`)
- `/insurer` → **Adjudicator Queue:** Ingestion ledger of incoming claims awaiting institutional review.
- `/insurer/claims/[id]` → **Adjudication Desk:** Side-by-side OCR review, pass/fail deterministic flags, and audit memo generator.
- `/insurer/compliance` → **NIA SLA Tracking:** 30-day penalty safe-harbor analytics.

---

## 3. Design System & Visual Guidelines
- **Theme:** **STRICT LIGHT MODE FIRST**. Designed specifically for high ambient light and auditorium projectors.
- **Palette:**
  - **Canvas Background:** `bg-[#F8FAFC]` (Slate-50) or pure `#FFFFFF`.
  - **Card Surfaces:** Pure white `#FFFFFF` with crisp 1px borders (`border border-slate-200/90 shadow-sm`). *Never use faint, low-opacity borders that disappear on projectors.*
  - **Headings & Body:** High-contrast `text-slate-900` (`#0F172A`) for primary text; `text-slate-600` (`#475569`) for secondary copy.
  - **Accents:** Emerald/Mint Green (`#059669` / `#10B981` / `#4EDEA3`) for CTAs, checkmarks, and badges (`bg-emerald-50 text-emerald-800 border-emerald-200`).
- **Typography:**
  - Layout / Body: `Geist`, `Inter`, or SF Pro.
  - Data / Status / Regulatory Tags: `JetBrains Mono` (e.g., `< 48 Hours`, `SEC-79`, `Day 4 of 30`).
- **Content Density:** Minimalist, punchy, scannable. **Strictly avoid walls of text or long corporate paragraphs.**

---

## 4. Frontend Architecture & Stitch MCP Guidelines

### ⚠️ CRITICAL CODE GENERATION RULES FOR STITCH MCP:
1. **NO MONOLITHIC FILES:** Never write entire pages (e.g., 500+ lines of JSX) into a single `page.tsx` file. All generated code MUST be broken down into clean, modular, typed components.
2. **Local vs. Global Component Directory Standard:**
   - **Page-Specific / Local Components:** Components used *only* on a specific page must be stored locally in a `_components/` directory adjacent to that page.
     - *Example:* `app/portal/_components/claims-table.tsx`
     - *Example:* `app/portal/claims/new/_components/upload-dropzone.tsx`
     - *Example:* `app/portal/claims/new/_components/scrubber-ledger.tsx`
   - **Global / Reusable UI Components:** Shared components used across multiple pages/portals must live in the root `@/components/` directory.
     - *Example:* `@/components/ui/button.tsx`
     - *Example:* `@/components/ui/badge.tsx`
     - *Example:* `@/components/shared/top-navbar.tsx`
     - *Example:* `@/components/shared/theme-toggle.tsx`

### Recommended Folder Structure:
```text
src/
├── app/
│   ├── (marketing)/
│   │   ├── _components/
│   │   │   ├── hero-section.tsx
│   │   │   ├── gateway-cards.tsx
│   │   │   ├── pipeline-grid.tsx
│   │   │   └── penalty-banner.tsx
│   │   └── page.tsx
│   │
│   ├── portal/
│   │   ├── _components/
│   │   │   ├── policy-summary-card.tsx
│   │   │   ├── sla-countdown-card.tsx
│   │   │   └── claims-ledger-table.tsx
│   │   ├── layout.tsx                # Policyholder Navbar + Context
│   │   ├── page.tsx                  # Dashboard
│   │   └── claims/
│   │       ├── new/
│   │       │   ├── _components/
│   │       │   │   ├── file-upload-box.tsx
│   │       │   │   └── real-time-scrubber.tsx
│   │       │   └── page.tsx
│   │       └── [id]/
│   │           ├── _components/
│   │           │   ├── audit-stepper.tsx
│   │           │   └── appeal-modal.tsx
│   │           └── page.tsx
│   │
│   └── insurer/
│       ├── _components/
│       │   └── adjudication-queue.tsx
│       ├── layout.tsx                # Insurer Sidebar + Header
│       └── page.tsx
│
└── components/                       # Global Reusable Components
    ├── ui/                           # Primitive primitives (shadcn-style)
    │   ├── button.tsx
    │   ├── card.tsx
    │   ├── badge.tsx
    │   └── progress.tsx
    └── shared/
        ├── brand-logo.tsx
        ├── app-header.tsx
        └── status-pill.tsx

---

## 5. Package Management & Tooling Guidelines
- **STRICTLY USE PNPM FOR EVERYTHING:** Always use `pnpm` for all dependency management, package installations, running scripts, and command execution (e.g. `pnpm add <pkg>`, `pnpm install`, `pnpm run dev`, `pnpm run build`, `pnpm dlx`, `pnpm exec`).
- Never use `npm`, `npx`, or `yarn`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
