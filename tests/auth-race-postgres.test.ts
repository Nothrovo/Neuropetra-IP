import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const harness = vi.hoisted(() => ({ pool: undefined as unknown as Pool, pauseRead: undefined as undefined | (() => Promise<void>), pauseInsert: undefined as undefined | (() => Promise<void>) }));
vi.mock('../lib/db-pool', () => ({ getReadPool: () => harness.pool, getMaintenancePool: () => harness.pool, getAuthPool: () => ({
 query: async (sql: string, values?: unknown[]) => {
  const result = await harness.pool.query(sql, values);
  if (sql.includes('password_hash') && sql.includes('WHERE username=')) await harness.pauseRead?.();
  return result;
 },
 connect: async () => {
  const client: PoolClient = await harness.pool.connect();
  return { release: () => client.release(), query: async (sql: string, values?: unknown[]) => {
   const result = await client.query(sql, values);
   if (sql.startsWith('INSERT INTO ip_intel_sessions')) await harness.pauseInsert?.();
   return result;
  } };
 },
}) }));
import { hashPassword, login, requireSession } from '../lib/auth';
import { GET as readiness } from '../app/api/ready/route';

const url = process.env.AUTH_RACE_TEST_DATABASE_URL;
if (url) {
 const target = new URL(url);
 if (target.hostname !== '127.0.0.1' || target.pathname !== '/ip_intel_auth_race_test') throw new Error('Refusing non-isolated auth race database');
}
function barrier() {
 let release!: () => void;
 const promise = new Promise<void>(resolve => { release = resolve; });
 return { promise, release };
}
let directory: string;
const oldPassword = 'synthetic old passphrase';
const newPassword = 'synthetic reset passphrase';
beforeAll(async () => {
 if (!url) return;
 harness.pool = new Pool({ connectionString: url, max: 6 });
 for (const migration of ['001_initial.sql', '002_auth.sql', '003_maintenance.sql', '004_feed_tokens.sql']) {
  await harness.pool.query(readFileSync('migrations/' + migration, 'utf8'));
 }
 await harness.pool.query('UPDATE ip_intel_installation SET installed_at=now()');
 directory = mkdtempSync(join(tmpdir(), 'auth-race-fixture-'));
 writeFileSync(join(directory, 'password'), newPassword, { mode: 0o600 });
});
afterAll(async () => {
 if (!url) return;
 await harness.pool.end();
 rmSync(directory, { recursive: true, force: true });
});
async function fixture() {
 harness.pauseRead = undefined; harness.pauseInsert = undefined;
 await harness.pool.query('TRUNCATE ip_intel_sessions,ip_intel_users,ip_intel_auth_attempts');
 await harness.pool.query("INSERT INTO ip_intel_users(id,username,password_hash,role) VALUES('11111111-1111-4111-8111-111111111111','owner',$1,'admin')", [await hashPassword(oldPassword)]);
}
function reset() {
 const child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/account.ts', 'reset-password', '--username', 'owner', '--password-file', join(directory, 'password')], {
  env: { ...process.env, AUTH_DATABASE_URL: url!, AUTH_DATABASE_URL_FILE: '' }, stdio: 'ignore',
 });
 return new Promise<void>((resolve, reject) => {
  child.once('error', () => reject(new Error('Synthetic reset process failed')));
  child.once('exit', code => code === 0 ? resolve() : reject(new Error('Synthetic reset command failed')));
 });
}

describe.skipIf(!url)('isolated PostgreSQL login/reset serialization', () => {
 it('checks actual complete schema and rejects missing feed/maintenance schema without leaking SQL', async () => {
  vi.stubEnv('APP_ORIGIN', 'https://synthetic.invalid');
  vi.stubEnv('MAINTENANCE_DATABASE_URL', url!); vi.stubEnv('MAINTENANCE_DATABASE_URL_FILE', '');
  try {
   expect((await readiness()).status).toBe(200);
   for (const table of ['app_feed_tokens', 'ip_intel_maintenance_plans']) {
    await harness.pool.query(`ALTER TABLE ${table} RENAME TO hidden_readiness_fixture`);
    try {
     const response = await readiness();
     expect(response.status).toBe(503);
     expect(await response.json()).toEqual({ status: 'unavailable' });
    } finally { await harness.pool.query(`ALTER TABLE hidden_readiness_fixture RENAME TO ${table}`); }
   }
   await harness.pool.query("DELETE FROM ip_intel_schema_migrations WHERE version='004'");
   try { expect((await readiness()).status).toBe(503); }
   finally { await harness.pool.query("INSERT INTO ip_intel_schema_migrations(version) VALUES('004')"); }
   expect((await readiness()).status).toBe(200);
  } finally { vi.unstubAllEnvs(); }
 });
 it('rejects a stale password read after the real reset CLI commits', async () => {
  await fixture();
  const read = barrier(); const resume = barrier();
  harness.pauseRead = async () => { read.release(); await resume.promise; };
  const attempt = login('owner', oldPassword).then(result => ({ status: 200, result }), error => ({ status: error.status }));
  await read.promise;
  try { await reset(); } finally { resume.release(); }
  expect(await attempt).toMatchObject({ status: 401 });
  expect((await harness.pool.query('SELECT count(*) FROM ip_intel_sessions WHERE revoked_at IS NULL')).rows[0].count).toBe('0');
  harness.pauseRead = undefined;
  await expect(login('owner', oldPassword)).rejects.toMatchObject({ status: 401 });
  const fresh = await login('owner', newPassword);
  expect((await requireSession(new Request('http://synthetic.invalid', { headers: { cookie: `soc_session=${fresh.token}` } }))).username).toBe('owner');
 }, 30000);
 it('holds the user row lock through session commit, so a waiting reset revokes that session', async () => {
  await fixture();
  const inserted = barrier(); const commit = barrier();
  harness.pauseInsert = async () => { inserted.release(); await commit.promise; };
  const attempt = login('owner', oldPassword).then(result => ({ result }), error => ({ error }));
  await inserted.promise;
  const resetting = reset();
  try {
   let blocked = false;
   for (let tries = 0; tries < 200; tries++) {
    const waiting = await harness.pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'UPDATE ip_intel_users SET password_hash=%'");
    if (waiting.rowCount) { blocked = true; break; }
    await new Promise(resolve => setTimeout(resolve, 25));
   }
   expect(blocked).toBe(true);
  } finally { commit.release(); }
  await resetting;
  const outcome = await attempt;
  expect((await harness.pool.query('SELECT count(*) FROM ip_intel_sessions WHERE revoked_at IS NULL')).rows[0].count).toBe('0');
  if ('result' in outcome) await expect(requireSession(new Request('http://synthetic.invalid', { headers: { cookie: `soc_session=${outcome.result!.token}` } }))).rejects.toMatchObject({ status: 401 });
 }, 30000);
});
