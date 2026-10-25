// rag_demo_claim_setu/src/embedder.mjs
// Embedding client using Gemini gemini-embedding-001 (3072 dimensions)
import { config } from './config.mjs';

/**
 * Validates that an embedding is an array of 3,072 finite numbers.
 * @param {any} vector
 */
export function validateVector(vector) {
  if (!Array.isArray(vector)) {
    throw new Error(`Embedding validation failed: expected Array, got ${typeof vector}`);
  }
  if (vector.length !== config.EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding validation failed: expected dimension ${config.EMBEDDING_DIMENSIONS}, got ${vector.length}`
    );
  }
  for (let i = 0; i < vector.length; i++) {
    if (typeof vector[i] !== 'number' || !Number.isFinite(vector[i])) {
      throw new Error(`Embedding validation failed: element at index ${i} is not a finite number (${vector[i]})`);
    }
  }
}

/**
 * Generate 3,072-dimensional embedding using Gemini gemini-embedding-001 via REST API
 * @param {string} text 
 * @returns {Promise<number[]>}
 */
export async function getGeminiEmbedding(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('Text to embed must be a non-empty string');
  }

  const apiKey = config.GEMINI_API_KEY;
  const modelName = config.EMBEDDING_MODEL;
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:embedContent?key=${apiKey}`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${modelName}`,
      content: {
        parts: [{ text: text.trim() }],
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Embedding API error (${response.status}): ${errorText}`);
  }

  const json = await response.json();
  if (!json.embedding || !json.embedding.values) {
    throw new Error(`Unexpected Gemini response format: ${JSON.stringify(json)}`);
  }

  const vector = json.embedding.values;
  validateVector(vector);

  return vector;
}

export default { getGeminiEmbedding, validateVector };
