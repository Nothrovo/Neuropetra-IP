import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ auth: { query: vi.fn() }, read: { query: vi.fn() }, maintenance: { query: vi.fn() } }));
vi.mock('../lib/db-pool', () => ({ getAuthPool: () => db.auth, getReadPool: () => db.read, getMaintenancePool: () => db.maintenance }));
import { GET } from '../app/api/ready/route';
let versions: string[];
beforeEach(() => {
 vi.clearAllMocks(); versions = ['001', '002', '003', '004'];
 vi.stubEnv('APP_ORIGIN', 'https://synthetic.invalid');
 vi.stubEnv('MAINTENANCE_DATABASE_URL', ''); vi.stubEnv('MAINTENANCE_DATABASE_URL_FILE', '');
 db.auth.query.mockResolvedValue({ rows: [{ singleton: true }], rowCount: 1 });
 db.maintenance.query.mockResolvedValue({ rows: [], rowCount: 0 });
 db.read.query.mockImplementation(async (sql: string, params?: unknown[]) => {
  if (!sql.includes('ip_intel_schema_migrations')) return { rows: [], rowCount: 0 };
  const wanted = params?.[0] as string[] | undefined;
  const selected = versions.filter(version => wanted ? wanted.includes(version) : sql.includes(`'${version}'`));
  return { rows: selected.map(version => ({ version })), rowCount: selected.length };
 });
});
afterEach(() => vi.unstubAllEnvs());
async function unavailable() {
 const response = await GET();
 expect(response.status).toBe(503);
 expect(response.headers.get('cache-control')).toBe('no-store');
 expect(await response.json()).toEqual({ status: 'unavailable' });
}
describe('required readiness schema', () => {
 it('fails closed when mandatory machine-feed migration 004 is absent', async () => {
  versions = ['001', '002'];
  await unavailable();
 });
 it('requires maintenance migration 003 only when that capability is configured', async () => {
  vi.stubEnv('MAINTENANCE_DATABASE_URL', 'postgresql://synthetic.invalid/fixture');
  versions = ['001', '002', '004'];
  await unavailable();
 });
 it.each([
  ['auth', 'ip_intel_users'], ['auth', 'ip_intel_sessions'], ['auth', 'ip_intel_auth_attempts'], ['auth', 'app_feed_tokens'],
  ['read', 'ip_intel_cache'], ['read', 'ip_intel_events'], ['read', 'ip_intel_reputation'],
  ['maintenance', 'ip_intel_maintenance_plans'], ['maintenance', 'ip_intel_maintenance_jobs'],
  ['maintenance', 'ip_intel_retention_policies'], ['maintenance', 'ip_intel_maintenance_audit'],
 ] as const)('sanitizes a missing required %s relation %s despite recorded versions', async (scope, table) => {
  vi.stubEnv('MAINTENANCE_DATABASE_URL', 'postgresql://synthetic.invalid/fixture');
  const original = db[scope].query.getMockImplementation()!;
  db[scope].query.mockImplementation(async (sql: string, ...params: unknown[]) => {
   if (sql.includes(table)) throw new Error('private-database-host: relation missing');
   return original(sql, ...params);
  });
  await unavailable();
 });
 it('sanitizes a missing feed-token id column despite recorded migration 004', async () => {
  const original = db.auth.query.getMockImplementation()!;
  db.auth.query.mockImplementation(async (sql: string, ...params: unknown[]) => {
   if (/SELECT\s+[^;]*\bid\b[^;]*FROM app_feed_tokens/i.test(sql)) {
    throw new Error('private-database-host: column id does not exist');
   }
   return original(sql, ...params);
  });
  await unavailable();
  expect(db.auth.query).toHaveBeenCalledWith(expect.stringMatching(/SELECT id,.*FROM app_feed_tokens LIMIT 0$/));
 });
 it('is ready with all optional maintenance relations and versions present', async () => {
  vi.stubEnv('MAINTENANCE_DATABASE_URL', 'postgresql://synthetic.invalid/fixture');
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
 });
 it('accepts the complete base schema without optional maintenance', async () => {
  versions = ['001', '002', '004'];
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'ready' });
  expect(db.maintenance.query).not.toHaveBeenCalled();
 });
});
