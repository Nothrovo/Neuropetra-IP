import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

describe('publication and operator deployment contract', () => {
  it('includes schema source in Git and excludes runtime artifacts', () => {
    const included = execFileSync('git', ['check-ignore', '--no-index', '--non-matching', '-v', 'migrations/001_initial.sql'], { encoding: 'utf8' });
    expect(included).toMatch(/!migrations\/\*\.sql/);
    for (const path of ['.runtime/secrets/auth-database-url', '.maintenance-pg/PG_VERSION', '.operator-db-test-fixture/password']) {
      expect(execFileSync('git', ['check-ignore', '--no-index', path], { encoding: 'utf8' }).trim()).toBe(path);
    }
  });
  it('provides a protected auth-only bootstrap operator without shipping credentials to the web process', () => {
    const operator = readFileSync('compose.operator.yml', 'utf8');
    expect(operator).toContain('target: operator');
    expect(operator).toContain('AUTH_DATABASE_URL_FILE');
    expect(operator).toContain('scripts/account.ts');
    expect(operator).toContain('/output/bootstrap-token');
    expect(operator).toContain('LOCAL_UID');
    expect(operator).not.toContain('postgres_password');
    expect(operator).not.toContain('migration_database_url');
  });
  it('keeps maintenance opt-in with its own role and real one-shot worker command', () => {
    const base = readFileSync('docker-compose.yml', 'utf8');
    const maintenance = readFileSync('compose.maintenance.yml', 'utf8');
    expect(base).not.toContain('MAINTENANCE_DATABASE_URL_FILE');
    expect(maintenance).toContain('MAINTENANCE_DATABASE_URL_FILE');
    expect(maintenance).toContain('MAINTENANCE_OWNERSHIP');
    expect(maintenance).toContain('scripts/maintenance-worker.mjs');
    expect(maintenance).toContain('profiles: ["operator"]');
    expect(maintenance).toContain('MAINTENANCE_RECOVERY_VERIFIED_AT');
  });
});
