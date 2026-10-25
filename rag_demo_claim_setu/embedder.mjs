// rag_demo_claim_setu/embedder.mjs
// Embedding client using Gemini gemini-embedding-001 (3072 dimensions)

import fs from 'fs';
import path from 'path';

// Helper to load .env if not already present
function loadEnv() {
  if (process.env.GEMINI_API_KEY) return;
  const envPaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env')
  ];
  for (const p of envPaths) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const idx = trimmed.indexOf('=');
          const k = trimmed.substring(0, idx).trim();
          const v = trimmed.substring(idx + 1).trim().replace(/^["']|["']$/g, '');
          if (!process.env[k]) process.env[k] = v;
        }
      }
      break;
    }
  }
}

loadEnv();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = 'gemini-embedding-001';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:embedContent?key=${GEMINI_API_KEY}`;

/**
 * Generate 3,072-dimensional embedding using Gemini gemini-embedding-001
 * @param {string} text 
 * @returns {Promise<number[]>}
 */
export async function getGeminiEmbedding(text) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not defined in environment variables');
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${MODEL_NAME}`,
      content: {
        parts: [{ text }]
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Embedding API error (${response.status}): ${errorText}`);
  }

  const json = await response.json();
  if (!json.embedding || !json.embedding.values) {
    throw new Error(`Unexpected Gemini response format: ${JSON.stringify(json)}`);
  }

  return json.embedding.values;
}
