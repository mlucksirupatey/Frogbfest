// rag_demo_claim_setu/src/config.mjs
import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env from current directory or parent directory
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const configSchema = z.object({
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required in environment variables'),
  EMBEDDING_MODEL: z.string().default('gemini-embedding-001'),
  EMBEDDING_DIMENSIONS: z.coerce.number().default(3072),
  DATABASE_URL: z.string().optional(),
  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_DB: z.string().default('claimsetu'),
  POSTGRES_USER: z.string().default('postgres'),
  POSTGRES_PASSWORD: z.string().default('devpassword'),
  PORT: z.coerce.number().default(4100),
  TOP_K: z.coerce.number().default(3),
});

let parsedConfig;
try {
  parsedConfig = configSchema.parse(process.env);
} catch (err) {
  if (err instanceof z.ZodError) {
    const errorDetails = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new Error(`Configuration validation error: ${errorDetails}`);
  }
  throw err;
}

export const config = parsedConfig;
export default config;
