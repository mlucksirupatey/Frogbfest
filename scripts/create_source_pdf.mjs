// scripts/create_source_pdf.mjs
// Generates the sample policy PDF matching the exact text provided in the prompt

import fs from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const pagesText = [
  // Page 1
  `SALICO Insurance Limited
SALICOHealth Insurance Policy

PREAMBLE
Whereas the Insured named in the Schedule hereto has made to SALICO Health Insurance Limited (hereinafter called the "Company" or "Insurer") a written proposal containing particulars and statements, along with declarations signed by or on behalf of the Insured, which shall be the basis of this contract and is deemed to be incorporated herein.

In consideration of the payment of the agreed premium by or on behalf of the Insured, the Company agrees, subject to the terms, conditions, limitations, exclusions, and provisions contained herein or endorsed hereon, to indemnify or pay specified benefits to the Insured Person(s) up to the sum insured limits set forth in the Policy Schedule for loss, bodily injury, medical expenses, or critical illness sustained during the Policy Period.

LIMITS OF RISK COVERED
The total coverage provided under this Policy for any single Insured Person during the Policy Period shall not exceed the specified limits in the Policy Schedule, categorized as follows:
• A. Accidental Insurance Benefit per person: As set forth in the Policy Schedule / Table of Benefits.
• B. Medical Treatment Benefit per person: As set forth in the Policy Schedule / Table of Allocation.
• C. Critical Illness Benefit per person: As set forth in the Policy Schedule / Fixed Benefit Amount.

SECTION 1: ACCIDENTAL INSURANCE
1.1 Definitions
• Insured / Insured Person: The individual(s) named in the Policy Schedule who are covered under the scope of this Policy.
• Accident: A sudden, unforeseen, involuntary, and violent event caused by external and visible means resulting in bodily injury to the Insured Person.`,

  // Page 2
  `• Permanent Total Disability (PTD): Unrecoverable physical disability resulting from an accident that entirely prevents the Insured Person from engaging in any gainful employment or occupation for at least three hundred sixty-five (365) consecutive days from the date of the accident, with no expectation of recovery.
• Irrecoverable Loss of Sight: Total and irreversible loss of sight in one or both eyes, continuing for at least three hundred sixty-five (365) consecutive days, leaving the Insured Person legally and permanently blind in the affected eye(s).
• Loss of Physical Use: Complete, permanent, and functional paralysis or physical severance of a limb or body part, persisting for a continuous period of not less than three hundred sixty-five (365) days from the date of the event.
• Other Dismemberments: Permanent loss of physical severance or total functional loss of fingers, toes, or ears not specified as total disability, evaluated proportionally based on medical assessment.
• Risk Group Extension (Riots and Terrorism): Coverage extended specifically to accidental death or disablement caused directly by acts of political violence, riots, strikes, civil commotion, or terrorism, provided such extension is explicitly endorsed on the Schedule.

1.2 Table of Accidental Benefits
Event / Disablement Description | Compensation (% of Sum Insured)
Accidental Death occurring within 183 days of the accident | 100%
Permanent Total Disability | 100%
Loss of both eyes, or both hands, or both feet | 100%
Loss of one eye and one limb (hand or foot) | 100%
Loss of one eye or one limb (hand or foot) | 50%
Loss of speech and hearing in both ears | 100%
Total loss of speech or total loss of hearing in both ears | 50%
Total loss of hearing in one ear | 20%
Loss of thumb | 20%
Loss of index finger | 15%
Loss of any other finger (each) | 7%`,

  // Page 3
  `Event / Disablement Description | Compensation (% of Sum Insured)
Loss of big toe | 5%
Loss of any other toe (each) | 4%
Other permanent physical dismemberment or partial functional loss | Proportional percentage as certified by an authorized medical board

1.3 Section Exceptions (Accidental Insurance)
The Company shall not be liable to make any payment under this section for bodily injury, death, or disablement directly or indirectly caused by, contributed to, or arising from:
1. Intentional self-injury, suicide, or attempted suicide, while sane or insane.
2. Accidents sustained while under the influence of intoxicating liquor, drugs, or narcotics, unless prescribed by a qualified medical practitioner.
3. Participation in aviation or aeronautical activities other than as a fare-paying passenger on a recognized commercial airline on a scheduled route.
4. Engaging in hazardous or extreme sports including, but not limited to, bungee jumping, motor racing, scuba diving, mountaineering requiring ropes or guides, paragliding, and skydiving.
5. Insanity, mental defect, or underlying psychiatric illness.
6. Participation in or commission of illegal or criminal acts.
7. Unnecessary exposure to exceptional danger (except in an attempt to save human life).
8. War, invasion, act of foreign enemy, hostilities (whether war be declared or not), civil war, rebellion, revolution, insurrection, mutiny, or military usurped power.
9. Ionizing radiation, radioactivity, nuclear fuel, or nuclear waste.

1.4 Section Conditions (Accidental Insurance)
1. Notice of Claim: Written notice of any claim under this Section must be provided to the Company within thirty-five (35) days of the occurrence of the event.
2. Documentation: In the event of death, an official police report, post-mortem report, and death certificate are mandatory prerequisites for claim assessment.
3. Cancellation Short Period Scale: If the policy is cancelled by the Insured, the Company shall retain premium according to the following short period rates:
Period on Risk | Premium Retained by Company
Up to 1 week | 10% of annual premium
Up to 1 month | 20% of annual premium`,

  // Page 4
  `Period on Risk | Premium Retained by Company
Up to 2 months | 30% of annual premium
Up to 3 months | 40% of annual premium
Up to 4 months | 50% of annual premium
Up to 5 months | 60% of annual premium
Up to 6 months | 70% of annual premium
Up to 7 months | 80% of annual premium
Up to 8 months | 90% of annual premium
Exceeding 8 months | 100% of annual premium

SECTION 2: MEDICAL TREATMENT INSURANCE (HOSPITALIZATION BENEFIT ONLY)
2.1 Table of Benefit Allocation
Claims under Medical Treatment Insurance are payable on a reimbursement basis for active, medically necessary inpatient hospitalization expenses, limited to the maximum sub-limits defined below:

Category A: Hospital Admission, Room & Bed Charges, ICU Charges (per illness episode) -> Up to 30% of Medical Sum Insured
Category B: Diagnostic Procedures, Pathology, Radiology, Laboratory Tests -> Up to 20% of Medical Sum Insured
Category C: Doctor/Surgeon Fees, Nursing Expenses, Operation Theatre Charges, Surgical Appliances, Medicines & Drugs, Local Ambulance Charges -> Up to 50% of Medical Sum Insured`,

  // Page 5
  `Category C (Continued): Medicines & Drugs, Local Ambulance Charges -> Up to 50% of Medical Sum Insured

2.2 Mandatory Excess
A compulsory deductible of First Rs. 500 shall apply to each and every admissible medical claim. The Company's liability shall apply only to expenses incurred over and above this amount.

2.3 Section Exceptions (Medical Treatment Insurance)
The Company shall not be liable for medical expenses arising out of:
1. Expenses incurred exceeding the overall limit or sub-category limits specified in the Schedule.
2. Treatments undergone within the first 30 days from the inception date of the Policy, except in cases of emergency accidental injury (this restriction does not apply to continuous renewals).
3. Routine eye examinations, dental care or surgery, cost of spectacles, contact lenses, and hearing aids.
4. Self-inflicted injuries, attempted suicide, or deliberate exposure to danger.
5. Cosmetics, plastic surgery, aesthetic treatments, weight management, or obesity procedures unless medically necessary due to an accident.
6. Vitamins, tonics, food supplements, and nutritional products not directly essential to treatment.
7. Maternity expenses, pregnancy, childbirth, caesarean section, abortion, or fertility treatments.
8. Ayurvedic, homeopathic, naturopathic, unani, or alternative medical treatments.
9. War, civil conflict, invasion, or radioactive contamination.
10. Medical treatment received outside the geographical boundaries of Nepal and India.
11. Acts of terrorism, riots, strikes, and civil commotion.
12. Medical treatment for any Insured Person above the age of 70 years.
13. Outbreak of epidemics or pandemics, including Covid-19 treatment expenses, unless specifically covered by an endorsement.
14. Pre-existing diseases or medical conditions existing prior to the inception of the policy.
15. Kidney stones, gallstones, or urinary tract calculi during the first year of coverage (eligible only upon continuous renewal).`,

  // Page 6
  `SECTION 3: CRITICAL ILLNESS
3.1 Covered Diseases
This benefit pays a fixed sum insured as specified in the Schedule upon the first diagnosis of any of the following eighteen (18) Critical Illnesses:
1. Cancer (Life Threatening)
2. End Stage Renal Failure (Kidney Failure)
3. Multiple Sclerosis
4. Benign Brain Tumour
5. Parkinson's Disease
6. End Stage Liver Disease (Liver Failure)
7. Alzheimer's Disease
8. Major Organ / Bone Marrow Transplant
9. Heart Valve Replacement or Repair
10. Coronary Artery Bypass Graft (CABG)
11. Surgery of Aorta
12. Stroke (resulting in permanent neurological deficit)
13. Permanent Paralysis of Limbs
14. Myocardial Infarction (First Heart Attack)
15. Coma of Specified Severity
16. Major Burns (at least 50% body surface area)
17. Total and Irreversible Loss of Hearing (Deafness in both ears)
18. Total and Irreversible Loss of Speech

3.2 Medical Definitions for Critical Illnesses
• Benign Brain Tumor: A non-cancerous tumor in the brain tissue in space within the skull, causing irreversible anatomical or physiological neuro-deficits certified by a neurologist, excluding cysts, granulomas, vascular malformations, hematomas, and tumors of the pituitary gland.
• Parkinson's Disease: Unequivocal diagnosis of primary Idiopathic Parkinson's Disease by a consultant neurologist, resulting in inability to perform at least 3 of the 6 Activities of Daily Living (ADLs) without assistance.
• Coma of Specified Severity: A state of unconsciousness with no reaction or response to external stimuli or internal needs, continuing for a continuous period of at least 96 hours, requiring life support systems and resulting in permanent neurological deficit.
• Deafness (Total Loss of Hearing): Total and irreversible loss of hearing in both ears as a result of illness or accident, certified by an Ear, Nose, and Throat (ENT) specialist with audiometric verification.`,

  // Page 7
  `• Fulminant Viral Hepatitis: A sub-massive to massive necrosis of the liver caused by any virus, leading precipitously to liver failure, jaundice, encephalopathy, and liver function impairment.
• Myocardial Infarction (First Heart Attack): The death of a portion of the heart muscle arising from inadequate blood supply, evidenced by typical clinical symptoms, fresh ECG changes, and elevation of cardiac biochemical markers (Troponin/CK-MB).
• Heart Valve Replacement: The actual undergoing of open-heart surgery to replace or repair one or more heart valves due to disease or abnormality.
• Kidney Failure (End Stage Renal Failure): End-stage renal disease presenting as chronic, irreversible failure of both kidneys to function, requiring regular renal dialysis or kidney transplantation.
• Life Threatening Cancer: A malignant tumor characterized by uncontrolled growth and spread of malignant cells with invasion and destruction of normal tissue, confirmed by histopathology reports.
• Liver Failure (End Stage Liver Disease): End-stage liver failure evidenced by permanent jaundice, ascites, and hepatic encephalopathy.
• Loss of Speech: Total and irreversible loss of the ability to speak due to physical injury or disease, persisting for a continuous period of 12 months.
• Major Organ / Bone Marrow Transplant: The actual undergoing of a transplant as a recipient of a human heart, lung, liver, kidney, pancreas, or bone marrow transplantation.
• Multiple Sclerosis: Unequivocal diagnosis of Multiple Sclerosis by a consultant neurologist showing persistent neurological deficits over a continuous period of 6 months.
• Alzheimer's Disease: Progressive, irreversible dementia caused by organic brain disease, resulting in severe cognitive impairment confirmed by clinical assessment.
• Paralysis (Permanent Paralysis of Limbs): Total and permanent loss of use of two or more limbs through flaccid or spastic paraplegia, hemiplegia, or tetraplegia resulting from injury or disease.
• Surgery of Aorta: The undergoing of surgery to repair or correct an aneurysm, narrowing, obstruction, or dissection of the thoracic or abdominal aorta.
• Stroke: Any cerebrovascular incident producing neurological sequelae lasting more than 24 hours, including infarction of brain tissue, hemorrhage, and embolization from an extra-cranial source.

3.3 Claim Provisions (Critical Illness)
1. Benefit payable under this section is a fixed lump sum paid upon unequivocal medical diagnosis supported by conclusive clinical, radiological, and histological evidence.
2. Standard pathology, histology, and laboratory reports from accredited diagnostic centers are mandatory.
3. Payment under this section operates independently and prohibits double indemnification under Section 2 (Medical Treatment Insurance) for identical medical expenses.`,

  // Page 8
  `3.4 Section Exceptions (Critical Illness)
No benefit shall be payable under Section 3 if the Critical Illness results directly or indirectly from:
1. Intentionally self-inflicted injury, suicide attempt, or drug/alcohol abuse.
2. War, invasion, act of foreign enemy, nuclear contamination, or military service.
3. Unproven, experimental, or non-standard medical therapies.
4. Participation in criminal or illegal acts.
5. Consequential loss, financial loss, or personal non-medical expenses.
6. Cosmetics, plastic surgery, or elective interventions.

3.5 Section Conditions (Critical Illness)
1. Non-transferability: Coverage and benefit rights under this section are strictly non-transferable to third parties.
2. Duty to Mitigate: The Insured Person must take all reasonable precautions and follow prescribed medical advice to mitigate the severity of the illness.
3. Fraudulent Claims: Any misrepresentation, suppression, or fraudulent declaration invalidates all claims under this policy.
4. Waiting Period: A mandatory initial waiting period of 30 days applies from the policy inception date. No critical illness diagnosed within this period shall be covered.

GENERAL POLICY CONDITIONS
1. Uniform Definitions: Words and expressions defined in this Policy Document shall carry the same meaning wherever they appear.
2. Proof of Loss / Claim Documents: The Insured must submit all original medical bills, discharge summaries, diagnostic reports, and completed claim forms within the stipulated timeframe.
3. Right to Medical Examination: The Company reserves the right to examine the Insured Person or conduct a post-mortem at its own expense through an appointed medical practitioner during claim processing.
4. Policy Expiry: Coverage terminates at midnight on the end date specified in the Policy Schedule.
5. Renewal Notice: The Company may issue renewal notices up to one month prior to expiry. Renewal is subject to mutual agreement and premium payment before policy lapse.
6. Misrepresentation and Voidance: This policy shall be voidable ab initio in the event of misrepresentation, deliberate non-disclosure, or fraud regarding material facts.
7. Premium Receipts: Premium payments are valid only when supported by official printed receipts issued by the Company.
8. Fraudulent Claims: If any claim under this policy is in any respect fraudulent, all benefits hereunder shall be forfeited.`,

  // Page 9
  `9. Litigation Time Limits: No legal action may be brought against the Company after the expiry of 3 months from the final rejection of a claim, nor unless written notification of the dispute is served within 35 days of the cause of action.
10. Written Communications: All notices and communications to the Company must be submitted in writing to its registered office address.
11. Burden of Proof: In any claim dispute or legal proceeding, the burden of proving that a loss or illness falls within the scope of policy coverage rests entirely upon the Insured Person.`
];

async function generate() {
  const dir = path.resolve('policy_work/source');
  fs.mkdirSync(dir, { recursive: true });

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < pagesText.length; i++) {
    const page = doc.addPage([595.28, 841.89]); // A4
    const text = pagesText[i];
    const lines = text.split('\n');

    let y = 800;
    for (const line of lines) {
      if (y < 40) break;
      const trimmed = line.trim();
      if (!trimmed) {
        y -= 12;
        continue;
      }
      // Wrap lines if too long
      const words = trimmed.split(' ');
      let currentLine = '';
      for (const w of words) {
        const testLine = currentLine ? `${currentLine} ${w}` : w;
        const width = font.widthOfTextAtSize(testLine, 10);
        if (width > 500 && currentLine) {
          page.drawText(currentLine, { x: 50, y, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
          y -= 14;
          currentLine = w;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) {
        page.drawText(currentLine, { x: 50, y, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
        y -= 14;
      }
    }
  }

  const pdfBytes = await doc.save();
  const target = path.join(dir, 'policy.pdf');
  fs.writeFileSync(target, pdfBytes);
  console.log(`Created source PDF at: ${target} (${pdfBytes.length} bytes, 9 pages)`);
}

generate().catch(console.error);
