// rag_demo_claim_setu/src/query_planner.mjs

/**
 * Deterministically generates RAG queries based on deterministic engine findings.
 * @param {Object} finding
 * @param {string} finding.code Finding code (e.g. WAITING_PERIOD, SUBLIMIT)
 * @param {string} finding.item The specific item/service/diagnosis flagged
 * @param {string} finding.claimFact A contextual fact from the claim (e.g. Patient has diabetes)
 * @returns {string[]} Array of queries
 */
export function buildQueries(finding) {
  switch (finding.code) {
    case 'WAITING_PERIOD':
      return [
        `waiting period for ${finding.item}`,
        `waiting period for pre-existing conditions relevant to ${finding.item}`,
      ];
    case 'PRE_EXISTING_EXCLUSION':
      return [
        `pre-existing condition exclusion for ${finding.item}`,
        'definition of pre-existing condition',
      ];
    case 'COVERAGE_EXCLUSION':
      return [`coverage or exclusion for ${finding.item}`];
    case 'CLAIM_ADMISSIBILITY':
      return [`claim admissibility conditions for ${finding.item}`];
    case 'SUBLIMIT':
      return [`limit or sub-limit for ${finding.item}`];
    default:
      return [
        `${finding.item}: claim states "${finding.claimFact || ''}". ` +
        `Explain the policy's coverage, exclusion, limit, or conditions relevant to this finding.`,
      ];
  }
}

export default { buildQueries };
