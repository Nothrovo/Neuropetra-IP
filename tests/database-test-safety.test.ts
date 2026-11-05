import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('PostgreSQL integration safety contract', () => {
  const fixture = readFileSync(new URL('./backend-postgres.test.ts', import.meta.url), 'utf8');
  it('requires explicit opt-in before registering database hooks', () => {
    expect(fixture).toMatch(/process\.env\.RUN_DATABASE_TESTS\s*===\s*['"]1['"]\s*\?\s*describe\s*:\s*describe\.skip/);
    expect(fixture.indexOf('suite(')).toBeLessThan(fixture.indexOf('beforeAll('));
  });
  it('does not embed Docker targets, credential files or operational DSN fallbacks', () => {
    expect(fixture).not.toMatch(/execFileSync|review-db\.env|ip-intel-implementation-test-db|55437|process\.env\.(READ|AUTH|REPUTATION)_DATABASE_URL/);
  });
});
