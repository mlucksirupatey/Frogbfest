`// Policy Template: SALICOHealth Insurance Policy
// Converted from SALICO Insurance Limited Policy PDF

Policy Attributes:
  Name: "SALICOHealth Insurance Policy"
  Issuer: "salico(synthetic)"
  UIN: "salico-health-mvp"
  Type: "Medical"
  Category: "Individual"
  Default copay %: 0
  Default waiting period: 30

Coverage:
  // [C-005] Category A: Hospital Admission Room Bed and ICU Charges (up to 30% of Medical Sum Insured)
  Svc(Hospital Admission Room and Bed Charges), Svc(ICU Charges):
    Limit per claim: 30% of Var(Medical Sum Insured)

  // [C-006] Category B: Diagnostic Procedures, Pathology, Radiology (up to 20% of Medical Sum Insured)
  Svc(Diagnostic Procedures), Svc(Pathology Tests), Svc(Radiology and Laboratory Tests):
    Limit per claim: 20% of Var(Medical Sum Insured)

  // [C-007] Category C: Surgeon Fees, Nursing, OT, Medicines & Drugs, Ambulance (up to 50% of Medical Sum Insured)
  Svc(Doctor and Surgeon Fees), Svc(Nursing Expenses), Svc(Operation Theatre Charges), Svc(Medicines and Drugs), Svc(Ambulance Charges):
    Limit per claim: 50% of Var(Medical Sum Insured)

  // [C-014] Waiting period for Calculi (Kidney stones, Gallstones) > 12 months
  Prc(Kidney stones surgery), Prc(Gallstones surgery):
    Included only if:
      Number of months between Var(Policy inception Date) and Var(Hospitalization start date) is greater than 12

  // [C-002, C-003] Accidental Insurance Benefits
  Prc(Accidental Death Compensation):
    Limit per claim: 100% of Var(Accidental Sum Insured)
    Included only if:
      Var(Admission Reason) is "Accident"

  Prc(Permanent Total Disability Compensation):
    Limit per claim: 100% of Var(Accidental Sum Insured)
    Included only if:
      Var(Admission Reason) is "Accident"

  // [C-015] Critical Illness Benefits (Fixed Sum Insured with 30-day waiting period)
  Dgn(Cancer), Dgn(Kidney Failure), Dgn(Multiple Sclerosis), Dgn(Stroke), Dgn(CABG), Dgn(Heart Attack):
    Limit per claim: 100% of Var(Critical Illness Sum Insured)
    Included only if:
      Number of days between Var(Policy inception Date) and Var(Hospitalization start date) is greater than 30

Exclusions:
  // [C-011] Section 2.3 Exceptions: Dental and Optical
  Svc(Routine eye examinations)
  Svc(Dental care or surgery)
  Svc(Cost of spectacles and contact lenses)
  Svc(Hearing aids)

  // [C-010] Section 2.3 Exceptions: Cosmetics and Plastic Surgery
  Prc(Cosmetics and Plastic Surgery):
    Excluded unless:
      Var(Admission Reason) is "Accident"

  // [C-004] Section 1.3 Exceptions: Self-inflicted
  Prc(Self-inflicted injury treatment)
  Svc(Alternative medical treatments)
  Svc(Maternity and fertility treatments)

Conditions:
    // [C-013] Patient Eligibility: Insured Person age must be <= 70 years
    Patient Eligibility:
      Var(Patient Age) <= 70

    // [C-009, C-012] Claim Admissibility: Geographical limit (Nepal or India) and 30-day initial waiting period
    Claim Admissibility:
      (Var(Country of Treatment) is "Nepal" or Var(Country of Treatment) is "India")
        and (Number of days between Var(Policy inception Date) and Var(Hospitalization start date) >= 30 or Var(Admission Reason) is "Accident")
`
