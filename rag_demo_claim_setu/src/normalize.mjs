// rag_demo_claim_setu/src/normalize.mjs

/**
 * Normalizes extracted PDF text while preserving legal clause structures
 * - Removes page delimiter noise like "-- 1 of 9 --"
 * - Collapses excessive blank lines
 * - Ensures clause references (e.g., 4.2) are kept intact
 * @param {string} rawText
 * @returns {string}
 */
export function normalizePolicyText(rawText) {
  // Remove page delimiters (e.g. "-- 1 of 9 --")
  let normalized = rawText.replace(/-- \d+ of \d+ --/g, '');

  // Normalize line endings to \n
  normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Collapse 3+ consecutive newlines into exactly two
  normalized = normalized.replace(/\n{3,}/g, '\n\n');

  // Collapse multiple spaces/tabs into a single space, but leave newlines alone
  normalized = normalized.replace(/[ \t]+/g, ' ');

  // Trim leading/trailing whitespace
  return normalized.trim();
}

export default { normalizePolicyText };
