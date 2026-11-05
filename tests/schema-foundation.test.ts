import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const sql = (text: string) => execFileSync('docker', ['exec', '-i', 'ip-intel-implementation-test-db', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'ip_intel_test'], {input:text,encoding:'utf8'});
describe.skipIf(process.env.RUN_DATABASE_TESTS !== '1')('owned PostgreSQL foundation (isolated synthetic container)', () => {
 it('migrates/replays safely and enforces separate runtime privilege boundaries', () => {
  const initial=readFileSync('migrations/001_initial.sql','utf8');
  const auth=readFileSync('migrations/002_auth.sql','utf8');
  for (let i=0;i<2;i++) sql(initial+'\n'+auth);
  const result=sql(`SELECT has_table_privilege('ip_intel_read','ip_intel_events','SELECT') AS readable,
   has_table_privilege('ip_intel_read','ip_intel_events','INSERT') AS reader_write,
   has_table_privilege('ip_intel_auth','ip_intel_events','UPDATE') AS auth_events,
   has_table_privilege('ip_intel_reputation','ip_intel_users','SELECT') AS reputation_auth,
   has_table_privilege('ip_intel_reputation','ip_intel_reputation','DELETE') AS reputation_delete;
   SELECT installed_at IS NULL AS fresh FROM ip_intel_installation WHERE singleton;
   SELECT column_default FROM information_schema.columns WHERE table_name='ip_intel_reputation' AND column_name='revision';`);
  expect(result).toMatch(/t\s+\| f\s+\| f\s+\| f\s+\| f/);
  expect(result).toContain('fresh'); expect(result).toContain('1');
 });
 it('stops on incompatible existing telemetry without destructive changes', () => {
  const initial=readFileSync('migrations/001_initial.sql','utf8');
  expect(()=>sql(`BEGIN; DROP TABLE ip_intel_events; ALTER TABLE ip_intel_cache RENAME COLUMN first_seen TO incompatible_first_seen;\n${initial}\nROLLBACK;`)).toThrow();
  expect(sql("SELECT count(*) FROM information_schema.columns WHERE table_name='ip_intel_cache' AND column_name='first_seen'")).toContain('1');
  expect(()=>sql(`BEGIN; ALTER TABLE ip_intel_cache ALTER COLUMN attack_types DROP DEFAULT; ALTER TABLE ip_intel_cache ALTER COLUMN attack_types TYPE integer[] USING '{}'::integer[];\n${initial}\nROLLBACK;`)).toThrow();
  expect(sql("SELECT udt_name FROM information_schema.columns WHERE table_name='ip_intel_cache' AND column_name='attack_types'")).toContain('_text');
 });
});
