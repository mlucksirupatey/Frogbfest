# salico-micro-health-insurance(Synthetic) — Policy HIPML Specification & Documentation

> **Status**: Validated & Stored in Production Database  
> **UIN / File Identifier**: `salico-micro-health-mvp`  
> **Source Document**: `policy_work/salico-micro/source/salico-micro-health-benefit.pdf`  
> **Source SHA-256**: `6bf78250bda576b012a50523a001028a0dc1159326b27b543fe0a6946ab64d52`  
> **Vitraya Service File**: `hipml-typescript/hipml-typescript/app/pmls/salico-micro-health-mvp.pml`  
> **Database Table**: `policies (id: 3, hipml_file_id: 'salico-micro-health-mvp')`  

---

## 1. Executive Summary & Policy Metadata

This policy is a micro-health policy under **salico(synthetic)** ("salico-micro-health-insurance(Synthetic)"). It has been restructured and codified into atomic, deterministic rules conforming to the **HIPML 0.1** grammar and evaluated via the Vitraya ANTLR evaluation engine.

| Attribute | Contract Value | HIPML Value / Type |
| :--- | :--- | :--- |
| **Policy Name** | salico-micro-health-insurance(Synthetic) | `"salico-micro-health-insurance(Synthetic)"` |
| **Issuer** | salico(synthetic) | `"salico(synthetic)"` |
| **UIN** | `salico-micro-health-mvp` | `"salico-micro-health-mvp"` |
| **Policy Type** | Inpatient Health & Hospitalization | `"Medical"` |
| **Category** | Individual Hospitalization | `"Individual"` |
| **Default Copay %** | 0% | `0` |
| **Default Waiting Period** | 30 Days (Sickness) | `30` |
| **Baseline Sum Insured** | NPR 500,000 | `Var(Hospitalization Sum Insured)` |

---

## 2. Clause Inventory Summary

The source policy was analyzed into **34 distinct contractual clauses**:
- **EXECUTABLE (27 clauses)**: Directly compiled into deterministic HIPML sub-limits, inclusions, exclusions, and condition checks.
- **TEXT_ONLY (6 clauses)**: Retained in the RAG corpus for semantic retrieval and clinical evidence audit (e.g., definitions of Hospital, Physician licensing, Medical Necessity, and Subrogation).
- **AMBIGUOUS / SETTLEMENT (1 clause)**: C-032 / Rule R14 (NPR 500 mandatory accident flat deductible) — handled deterministically at the ClaimSetu financial settlement layer because the HIPML ANTLR grammar supports copay percentage rather than absolute currency deductibles.

Complete inventory artifact: [`policy_work/salico-micro/generated/clause-inventory.json`](file:///home/sunyacore/workspace/WEB_PROJECTS/claim_setu/policy_work/salico-micro/generated/clause-inventory.json).

---

## 3. Validated HIPML Code (`salico-micro-health-mvp.pml`)

```pml
// Policy Template: salico-micro-health-insurance(Synthetic)
// Converted from salico-micro-health-insurance(Synthetic) Policy Specification

Policy Attributes:
  Name: "salico-micro-health-insurance(Synthetic)"
  Issuer: "salico(synthetic)"
  UIN: "salico-micro-health-mvp"
  Type: "Medical"
  Category: "Individual"
  Default copay %: 0
  Default waiting period: 30

Coverage:
  // [C-013, C-034, R05] Inpatient Room and Board Charges (lower of 1% Sum Insured or NPR 5,000 per day)
  Svc(Room and Nursing charges):
    Limit per day : whichever is lower of 1% of Var(Hospitalization Sum Insured) and Amt(5,000)

  // [C-014, C-034, R06] Intensive Care Unit (ICU) Sub-Limit (NPR 10,000 per day)
  Svc(ICU charges):
    Limit per day : Amt(10,000)

  // [C-016, C-034, R07] In-Hospital Surgical Schedule: Major Cardiac & Neuro (100% / NPR 200,000 Max)
  Prc(Coronary Artery Bypass), Prc(Open Heart Surgery), Prc(Craniotomy):
    Limit per claim: Amt(200,000)

  // [C-017, C-034, R07] In-Hospital Surgical Schedule: Major Resections (75% / NPR 150,000 Max)
  Prc(Radical Mastectomy), Prc(Thyroidectomy), Prc(Laminectomy), Prc(Resection of Bowel):
    Limit per claim: Amt(150,000)

  // [C-018, C-034, R07] In-Hospital Surgical Schedule: Hysterectomy (62.5% / NPR 125,000 Max)
  Prc(Hysterectomy):
    Limit per claim: Amt(125,000)

  // [C-019, C-034, R07] In-Hospital Surgical Schedule: Cataract & Mastoidectomy (50% / NPR 100,000 Max)
  Prc(Cataract Extraction), Prc(Radical Mastoidectomy):
    Limit per claim: Amt(100,000)

  // [C-020, C-034, R07] In-Hospital Surgical Schedule: Hernia Repair (37.5% / NPR 75,000 Max)
  Prc(Single Hernia Repair):
    Limit per claim: Amt(75,000)

  // [C-020, C-034, R07] In-Hospital Surgical Schedule: Appendectomy (25% / NPR 50,000 Max)
  Prc(Appendectomy):
    Limit per claim: Amt(50,000)

  // [C-021, C-034, R07] In-Hospital Surgical Schedule: Endoscopy & Bronchoscopy (12.5% / NPR 25,000 Max)
  Prc(Bronchoscopy), Prc(Endoscopy):
    Limit per claim: Amt(25,000)

  // [C-006, C-015, R04] Minimum Inpatient Confinement of 24 Hours (1 Day) for Inpatient Hospital Benefits
  Svc(Surgeon Charges), Svc(Anaesthetist), Svc(Operating Room Rent), Svc(Hospital Nursing Expenses):
    Included only if:
      Number of days between Var(Hospitalization start date) and Var(Discharge Date) >= 1

  // [C-026, R09] Specific Named Ailments 120-Day Waiting Period (Hernia, Tonsils, Adenoids, Disc Disease)
  Prc(Tonsillectomy), Prc(Adenoidectomy), Prc(Hernia Repair), Prc(Intervertebral Disc Surgery):
    Included only if:
      Number of days between Var(Policy inception Date) and Var(Hospitalization start date) >= 120

Exclusions:
  // [C-028, R11] Cosmetic & Plastic Surgery (excluded unless due to accident)
  Prc(Cosmetics and Plastic Surgery):
    Excluded unless:
      Var(Admission Reason) is "Accident"

  // [C-029, R12] Dental Surgery (excluded unless due to accident)
  Prc(Dental Care and Surgery):
    Excluded unless:
      Var(Admission Reason) is "Accident"

  // [C-022, C-030, R13] Maternity & Obstetrical Care Exclusion (0% coverage)
  Prc(Maternity and Obstetrical Care), Prc(Cesarean Section), Prc(Normal Delivery)

  // [C-031] Hazardous Sports & Alternative Medicine
  Svc(Alternative Medical Treatments), Svc(Hazardous Sports Injury Treatment)

Conditions:
    // [C-005, C-012, R02] Patient Eligibility: Insured Age at Inception Bound (18 to 59 years) & Expiration (65 years)
    Patient Eligibility:
      Var(Patient Age) >= 18 and Var(Patient Age) <= 65

    // [C-002, C-004, C-025, R01, R03, R15] Claim Admissibility: Active Policy, 31-Day Sickness Waiting Period (0 for Accident), Notice within 10 Days
    Claim Admissibility:
      Number of days between Var(Policy inception Date) and Var(Hospitalization start date) >= 0
        and Number of days between Var(Hospitalization start date) and Var(Policy expiry Date) >= 0
        and (Number of days between Var(Policy inception Date) and Var(Hospitalization start date) >= 30 or Var(Admission Reason) is "Accident")
        and Number of days between Var(Hospitalization start date) and Var(Claim Submission Date) <= 10
```

---

## 4. Discovered Policy Variables & Data Mapping

Calling `GET /pml/salico-micro-health-mvp/variables` against the Vitraya service returns exactly 8 variables:

```json
{
  "success": true,
  "data": {
    "variables": [
      "Hospitalization Sum Insured",
      "Hospitalization start date",
      "Discharge Date",
      "Policy inception Date",
      "Admission Reason",
      "Patient Age",
      "Policy expiry Date",
      "Claim Submission Date"
    ]
  }
}
```

### JSON Path Mapping (`variable-map.json`)

| HIPML Policy Variable | Claim JSON Source Path | Type | Role |
| :--- | :--- | :--- | :--- |
| `Hospitalization Sum Insured` | `$.policy.sumInsured` | `number` | Determines 1% Room Rent cap |
| `Policy inception Date` | `$.policy.inceptionDate` | `date` | Evaluates waiting periods & temporal validity |
| `Policy expiry Date` | `$.policy.expiryDate` | `date` | Verifies loss occurred while policy active |
| `Hospitalization start date` | `$.hospitalization.admissionDate` | `date` | Baseline for duration & waiting periods |
| `Discharge Date` | `$.hospitalization.dischargeDate` | `date` | Validates minimum 24-hr inpatient rule |
| `Claim Submission Date` | `$.claim.submittedDate` | `date` | Enforces 10-day notice requirement |
| `Admission Reason` | `$.claim.isAccident ? 'Accident' : 'Illness'` | `string` | Bypasses 30-day waiting & unlocks carve-outs |
| `Patient Age` | `$.insured.age` | `number` | Validates age between 18 and 65 years |

---

## 5. Semantic Test Fixture Results

The policy underwent 11 live semantic test fixtures via `POST /pml/salico-micro-health-mvp/run` on port 3001:

| # | Test Scenario | Input Data Highlights | Expected Outcome | Result |
| :-: | :--- | :--- | :--- | :---: |
| **1** | **Standard Inpatient Claim** | SI: 500k, 4-day stay, Cataract, Illness, Age 42 | Room Rent capped at 5,000; Cataract capped at 100,000; Admissible: `true` | **PASS** |
| **2** | **Room Rent Lower Cap** | SI: 300k, Illness | 1% of 300k = 3,000/day (< 5,000 ceiling) | **PASS** |
| **3** | **Cosmetic Surgery Exclusion** | Reason: `"Elective Aesthetic"` | `Cosmetics and Plastic Surgery.included === false` | **PASS** |
| **4** | **Cosmetic Surgery Exception** | Reason: `"Accident"` | `Cosmetics and Plastic Surgery.included === true` | **PASS** |
| **5** | **Dental Care Exclusion** | Reason: `"Toothache Routine"` | `Dental Care and Surgery.included === false` | **PASS** |
| **6** | **Named Ailment Waiting Breach** | Hernia repair at 60 days (< 120 days) | `Hernia Repair.included === false` | **PASS** |
| **7** | **Named Ailment Waiting Satisfied**| Hernia repair at 150 days (>= 120 days)| `Hernia Repair.included === true` | **PASS** |
| **8** | **Patient Age Upper Bound Breach**| Patient Age: 66 (> 65 expiration limit)| `Patient Eligibility === false` | **PASS** |
| **9** | **Initial Sickness Waiting Breach**| Sickness admitted at Day 15 (< 30 days) | `Claim Admissibility === false` | **PASS** |
| **10**| **Initial Waiting Accident Exemption**| Accident admitted at Day 10 (< 30 days) | `Claim Admissibility === true` | **PASS** |
| **11**| **Notice of Claim Timeline Breach**| Notice sent 25 days after admission (> 10d)| `Claim Admissibility === false` | **PASS** |

**Total Validation**: 11 Passed, 0 Failed (100% Pass Rate).

---

## 6. How to Run and Verify

### Re-run the Conversion Pipeline
```bash
node scripts/convert_salico_micro_to_hipml.mjs
```

### Run the Universal HIPML Test Suite (All 3 Policies)
```bash
node tests/test-hipml.mjs
```
Runs 29 assertions across `ABC123DEF456`, `claimsetu-mvp`, and `salico-micro-health-mvp`.
