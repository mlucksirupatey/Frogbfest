// rag_demo_claim_setu/src/context_builder.mjs

/**
 * Packages claim facts, findings, and retrieved evidence into a structured string 
 * formatted for a downstream LLM prompt.
 * 
 * @param {Object} data
 * @param {Object} data.claimFacts Structured JSON representation of the claim
 * @param {Object[]} data.deterministicFindings Array of flags/findings from the deterministic engine
 * @param {Object[]} data.evidence Array of retrieved chunks from pgvector
 * @returns {string} Formatted context block
 */
export function buildContextPrompt(data) {
  const { claimFacts, deterministicFindings, evidence } = data;

  let prompt = `--- CLAIM FACTS ---\n`;
  prompt += JSON.stringify(claimFacts || {}, null, 2);
  prompt += `\n\n`;

  prompt += `--- DETERMINISTIC FINDINGS ---\n`;
  if (!deterministicFindings || deterministicFindings.length === 0) {
    prompt += `No findings generated.\n`;
  } else {
    deterministicFindings.forEach((f, idx) => {
      prompt += `[${idx + 1}] Code: ${f.code} | Item: ${f.item}\n`;
      if (f.claimFact) prompt += `    Fact: ${f.claimFact}\n`;
    });
  }
  prompt += `\n`;

  prompt += `--- RETRIEVED POLICY EVIDENCE ---\n`;
  if (!evidence || evidence.length === 0) {
    prompt += `No evidence retrieved.\n`;
  } else {
    evidence.forEach((chunk, idx) => {
      prompt += `[EVIDENCE_${idx + 1}]\n`;
      if (chunk.section_title) prompt += `Section: ${chunk.section_title}\n`;
      if (chunk.clause_ref) prompt += `Clause: ${chunk.clause_ref}\n`;
      prompt += `Similarity Score: ${(chunk.cosine_similarity * 100).toFixed(2)}%\n`;
      prompt += `Text:\n${chunk.chunk_text}\n\n`;
    });
  }

  prompt += `--- TASK ---\n`;
  prompt += `Explain whether the identified exclusion or condition appears applicable based solely on the supplied evidence.\n`;
  prompt += `If evidence is insufficient, state INSUFFICIENT_EVIDENCE.\n`;
  prompt += `Provide your output in valid JSON format.\n`;

  return prompt;
}

export default { buildContextPrompt };
