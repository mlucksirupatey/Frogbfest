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
