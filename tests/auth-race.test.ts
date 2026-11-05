import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn() }));
vi.mock('../lib/db-pool', () => ({ getAuthPool: () => db }));
import { hashPassword, login } from '../lib/auth';
import { storeSession } from '../lib/user-repository';

describe('credential-checked session transaction', () => {
 it('keeps the user row locked until session insertion commits', async () => {
  const query = vi.fn(async (sql: string) => ({ rows: sql.startsWith('SELECT') ? [{ password_hash: 'verified-hash', disabled: false }] : [], rowCount: 1 }));
  const release = vi.fn(); db.connect.mockResolvedValue({ query, release });
  expect(await storeSession('token-digest', 'user-1', 1000, 'verified-hash')).toBe(true);
  expect(query.mock.calls.map(call => call[0])).toEqual([
   'BEGIN', 'SELECT password_hash,disabled FROM ip_intel_users WHERE id=$1 FOR UPDATE',
   'INSERT INTO ip_intel_sessions(token_hash,user_id,expires_at) VALUES ($1,$2,$3)', 'COMMIT',
  ]);
  expect(release).toHaveBeenCalledOnce();
 });
 it.each([undefined, { password_hash: 'changed-hash', disabled: false }, { password_hash: 'verified-hash', disabled: true }])('rolls back without insertion for a missing, changed or disabled credential: %j', async current => {
  const query = vi.fn(async (sql: string) => ({ rows: sql.startsWith('SELECT') && current ? [current] : [], rowCount: current ? 1 : 0 }));
  const release = vi.fn(); db.connect.mockResolvedValue({ query, release });
  expect(await storeSession('token-digest', 'user-1', 1000, 'verified-hash')).toBe(false);
  expect(query.mock.calls.map(call => call[0])).toEqual(['BEGIN', 'SELECT password_hash,disabled FROM ip_intel_users WHERE id=$1 FOR UPDATE', 'ROLLBACK']);
  expect(release).toHaveBeenCalledOnce();
 });
 it('rolls back insertion failures and releases the database connection', async () => {
  const query = vi.fn(async (sql: string) => {
   if (sql.startsWith('INSERT')) throw new Error('synthetic insertion failure');
   return { rows: [{ password_hash: 'verified-hash', disabled: false }], rowCount: 1 };
  });
  const release = vi.fn(); db.connect.mockResolvedValue({ query, release });
  await expect(storeSession('token-digest', 'user-1', 1000, 'verified-hash')).rejects.toThrow('synthetic insertion failure');
  expect(query).toHaveBeenLastCalledWith('ROLLBACK');
  expect(release).toHaveBeenCalledOnce();
 });
});

function barrier() {
 let release!: () => void;
 const promise = new Promise<void>(resolve => { release = resolve; });
 return { promise, release };
}

let oldHash: string;
beforeAll(async () => { oldHash = await hashPassword('synthetic old passphrase'); });
beforeEach(() => vi.clearAllMocks());

describe('login credential snapshot concurrency', () => {
 it('rejects an old password read before a password reset commits, without inserting a session', async () => {
  const read = barrier(); const resume = barrier();
  let currentHash = oldHash;
  const sessions: string[] = [];
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
   if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
   if (sql.includes('FOR UPDATE')) return { rows: [{ id: 'user-1', password_hash: currentHash, disabled: false }], rowCount: 1 };
   if (sql.startsWith('INSERT INTO ip_intel_sessions')) { sessions.push(String(values?.[0])); return { rows: [], rowCount: 1 }; }
   throw new Error('Unexpected transaction query');
  });
  db.connect.mockResolvedValue({ query, release: vi.fn() });
  db.query.mockImplementation(async (sql: string, values?: unknown[]) => {
   if (sql.includes('ip_intel_auth_attempts')) return { rows: [{ attempts: 1 }], rowCount: 1 };
   if (sql.includes('password_hash') && sql.includes('WHERE username=')) {
    const snapshot = { id: 'user-1', username: 'owner', password_hash: currentHash, role: 'admin', disabled: false };
    read.release(); await resume.promise;
    return { rows: [snapshot], rowCount: 1 };
   }
   if (sql.includes('SELECT 1 FROM ip_intel_installation')) return { rows: [{}], rowCount: 1 };
   if (sql.startsWith('INSERT INTO ip_intel_sessions')) { sessions.push(String(values?.[0])); return { rows: [], rowCount: 1 }; }
   if (sql.includes('JOIN ip_intel_users')) return { rows: sessions.length ? [{ id: 'user-1', username: 'owner', role: 'admin', expires_at: new Date(Date.now()+60000), recent_auth_at: new Date() }] : [], rowCount: sessions.length };
   throw new Error('Unexpected pool query');
  });
  const attempt = login('owner', 'synthetic old passphrase');
  const outcome = attempt.then(() => ({ status: 200 }), (error: { status: number }) => error);
  await read.promise;
  // Deterministic reset-commit barrier: the durable credential is replaced and
  // all existing sessions revoked before the stale read may continue.
  currentHash = 'replacement-credential-hash'; sessions.length = 0;
  resume.release();
  expect(await outcome).toMatchObject({ status: 401 });
  expect(sessions).toHaveLength(0);
 });
});
