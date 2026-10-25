// scripts/migrate.mjs
// Automated cross-platform PostgreSQL database migration & seed runner
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const migrationFiles = [
  'db/002_documents_processing.sql',
  'db/003_claim_reasoning.sql',
  'db/004_seed_all_policies.sql',
  'db/005_auth_system.sql',
  'db/006_members_csv_sync.sql'
];

async function loadPg() {
  try {
    const mod = await import('pg');
    return mod.default || mod;
  } catch {
    const nextjsPg = path.join(rootDir, 'nextjs', 'node_modules', 'pg', 'lib', 'index.js');
    if (fs.existsSync(nextjsPg)) {
      const mod = await import(`file://${nextjsPg}`);
      return mod.default || mod;
    }
  }
  return null;
}

async function runWithPg(pg) {
  console.log('🔄 Connecting to PostgreSQL via node-pg...');
  const pool = new pg.Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'claimsetu',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'devpassword',
    connectionTimeoutMillis: 5000,
  });

  const client = await pool.connect();
  try {
    console.log('✅ Connected successfully.\n');

    for (const relPath of migrationFiles) {
      const fullPath = path.join(rootDir, relPath);
      if (!fs.existsSync(fullPath)) {
        console.warn(`⚠️  Skipping missing migration file: ${relPath}`);
        continue;
      }
      console.log(`▶️  Applying ${relPath}...`);
      const sql = fs.readFileSync(fullPath, 'utf8');
      await client.query(sql);
      console.log(`   ✔️  Applied ${relPath}`);
    }

    console.log('\n📊 Migration Status Summary:');
    const { rows: insts } = await client.query('SELECT id, name, code FROM institutions ORDER BY id');
    console.log(`  Institutions (${insts.length}):`, insts.map(i => `${i.id}: ${i.name} [${i.code}]`).join(', '));

    const { rows: policies } = await client.query('SELECT id, name, hipml_file_id FROM policies ORDER BY id');
    console.log(`  Policies (${policies.length}):`, policies.map(p => `${p.id}: ${p.hipml_file_id}`).join(', '));

    const { rows: users } = await client.query('SELECT id, email, role FROM users ORDER BY id');
    console.log(`  Users (${users.length}):`, users.map(u => `${u.id}: ${u.email} (${u.role})`).join(', '));

    const { rows: claims } = await client.query('SELECT COUNT(*) AS count FROM claims');
    console.log(`  Total Claims: ${claims[0].count}`);

    console.log('\n🎉 All migrations and seed data applied successfully!');
  } finally {
    client.release();
    await pool.end();
  }
}

function runWithDocker() {
  console.log('🐳 Running migrations via docker exec on container postgres-local...');
  for (const relPath of migrationFiles) {
    const fullPath = path.join(rootDir, relPath);
    if (!fs.existsSync(fullPath)) {
      console.warn(`⚠️  Skipping missing migration file: ${relPath}`);
      continue;
    }
    console.log(`▶️  Applying ${relPath}...`);
    const sql = fs.readFileSync(fullPath, 'utf8');
    execSync('docker exec -i postgres-local psql -U postgres -d claimsetu', {
      input: sql,
      stdio: ['pipe', 'inherit', 'inherit']
    });
    console.log(`   ✔️  Applied ${relPath}`);
  }
  console.log('\n🎉 All migrations and seed data applied successfully via Docker!');
}

async function main() {
  const pg = await loadPg();
  if (pg) {
    try {
      await runWithPg(pg);
      return;
    } catch (err) {
      console.warn('⚠️  node-pg execution failed, falling back to docker exec:', err.message);
    }
  } else {
    console.log('ℹ️  node-pg package not found in root or nextjs, falling back to docker exec.');
  }

  runWithDocker();
}

main().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
