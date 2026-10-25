// rag_demo_claim_setu/src/db.mjs
import pg from 'pg';
import { config } from './config.mjs';

const { Pool } = pg;

export const pool = new Pool(
  config.DATABASE_URL
    ? { connectionString: config.DATABASE_URL }
    : {
        host: config.POSTGRES_HOST,
        port: config.POSTGRES_PORT,
        database: config.POSTGRES_DB,
        user: config.POSTGRES_USER,
        password: config.POSTGRES_PASSWORD,
      }
);

/**
 * Format float array as pgvector string representation: '[val1, val2, ...]'
 * @param {number[]} vector 
 * @returns {string}
 */
export function toPgVector(vector) {
  return `[${vector.join(',')}]`;
}

/**
 * Verify DB connection and pgvector extension
 */
export async function checkDbConnection() {
  const client = await pool.connect();
  try {
    const extRes = await client.query(
      `SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';`
    );
    if (extRes.rows.length === 0) {
      throw new Error('pgvector extension is not installed in database');
    }
    return {
      connected: true,
      pgvectorVersion: extRes.rows[0].extversion,
    };
  } finally {
    client.release();
  }
}
