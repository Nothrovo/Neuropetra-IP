import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink, readFile } from 'node:fs/promises';
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertReleaseBoundary, assertDockerBoundary } from '../lib/release-boundary';

describe('release boundaries', () => {
  it('rejects secrets, dumps and backup files without echoing values', async () => {
    const root = await mkdtemp(join(tmpdir(), 'release-fixture-'));
    try {
      await mkdir(join(root, 'app'));
      await writeFile(join(root, 'app/source.ts'), "const key = '" + 'a'.repeat(80) + "';");
      await expect(assertReleaseBoundary(root, ['app/source.ts'])).rejects.toThrow('app/source.ts');
      for (const name of ['.env.local', 'snapshot.sql', 'script.js.bak']) {
        await writeFile(join(root, name), 'synthetic-marker');
        await expect(assertReleaseBoundary(root, [name])).rejects.toThrow(name);
      }
      await writeFile(join(root, '.env.example'), 'ABUSEIPDB_API_KEY=\n');
      await expect(assertReleaseBoundary(root, ['.env.example'])).resolves.toBeUndefined();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('rejects unknown private operators and unsupported production extensions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'release-unknown-'));
    try {
      for (const name of ['private-operator.sh', 'private-operator.ts', '.maintenance-pg-synthetic-output']) {
        await writeFile(join(root, name), 'synthetic-marker');
        await expect(assertReleaseBoundary(root, [name])).rejects.toThrow(name);
      }
      await mkdir(join(root, 'scripts'));
      await writeFile(join(root, 'scripts/private-operator.ts'), 'synthetic-marker');
      await expect(assertReleaseBoundary(root, ['scripts/private-operator.ts'])).rejects.toThrow('scripts/private-operator.ts');
      await mkdir(join(root, 'app'));
      await writeFile(join(root, 'app/private.sh'), 'synthetic-marker');
      await expect(assertReleaseBoundary(root, ['app/private.sh'])).rejects.toThrow('app/private.sh');
      await expect(assertReleaseBoundary(root, ['nonexistent-private-operator.sh'])).rejects.toThrow('nonexistent-private-operator.sh');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('requires approved paths to exist and rejects symlink escapes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'release-paths-'));
    const outside = await mkdtemp(join(tmpdir(), 'release-outside-'));
    try {
      for (const name of ['app/missing.ts', 'scripts/install.mjs', '.env.example', 'public/file.svg']) {
        await expect(assertReleaseBoundary(root, [name])).rejects.toThrow(name);
      }
      await mkdir(join(root, 'app'));
      await writeFile(join(outside, 'private.ts'), 'synthetic-marker');
      await symlink(join(outside, 'private.ts'), join(root, 'app/link.ts'));
      await expect(assertReleaseBoundary(root, ['app/link.ts'])).rejects.toThrow('app/link.ts');
      await symlink(outside, join(root, 'lib'));
      await expect(assertReleaseBoundary(root, ['lib/private.ts'])).rejects.toThrow('lib/private.ts');
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
  it('rejects existing nested runtime files without reading their contents', async () => {
    const root = await mkdtemp(join(tmpdir(), 'release-nested-'));
    try {
      await mkdir(join(root, 'app/.runtime'), { recursive: true });
      await writeFile(join(root, 'app/.runtime/private.ts'), 'synthetic-marker');
      await expect(assertReleaseBoundary(root, ['app/.runtime/private.ts'])).rejects.toThrow('app/.runtime/private.ts');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('rejects nested auth-race runtime components before reading any contents', async () => {
    const root = await mkdtemp(join(tmpdir(), 'release-auth-race-'));
    try {
      for (const name of ['app/.auth-race-pg/private.ts', 'lib/nested/.auth-race-pg/private.ts',
        'tests/.auth-race-pg/deeper/private.ts']) {
        await mkdir(join(root, name, '..'), { recursive: true });
        await writeFile(join(root, name), 'synthetic-marker');
        vi.mocked(readFile).mockClear();
        let failure: unknown;
        try { await assertReleaseBoundary(root, [name]); } catch (error) { failure = error; }
        expect(readFile).not.toHaveBeenCalled();
        expect(failure).toBeInstanceOf(Error);
        expect((failure as Error).message).toContain(name);
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('rejects runtime state even when a manifest explicitly includes it', async () => {
    for (const name of ['.secrets/token', '.runtime/owner/bootstrap-token', '.maintenance-pg/PG_VERSION',
      '.backend-pg/PG_VERSION', '.operator-db-test-fixture/password', '.install-test-fixture/password',
      'app/.runtime/private.ts', 'lib/.backend-pg/private.ts', 'tests/.install-test-fixture/private.ts']) {
      await expect(assertReleaseBoundary('.', [name])).rejects.toThrow(name);
    }
  });
  it('distinguishes runtime interpolation from an embedded credential literal', async () => {
    const root = await mkdtemp(join(tmpdir(), 'release-literal-'));
    try {
      await mkdir(join(root, 'app'));
      await writeFile(join(root, 'app/dynamic.ts'), 'const url = `postgresql://user:${password}@db/app`;');
      await expect(assertReleaseBoundary(root, ['app/dynamic.ts'])).resolves.toBeUndefined();
      await writeFile(join(root, 'app/embedded.ts'), "const url = 'postgresql://user:synthetic-password@db/app';");
      await expect(assertReleaseBoundary(root, ['app/embedded.ts'])).rejects.toThrow('app/embedded.ts');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('scans approved scripts, SQL, CSS and unexempted tests', async () => {
    const root = await mkdtemp(join(tmpdir(), 'release-content-'));
    try {
      for (const dir of ['scripts', 'migrations', 'app', 'tests']) await mkdir(join(root, dir));
      for (const name of ['scripts/install.mjs', 'migrations/001_initial.sql', 'app/globals.css', 'tests/new.test.ts']) {
        await writeFile(join(root, name), "const url = 'postgresql://user:synthetic-password@db/app';");
        await expect(assertReleaseBoundary(root, [name])).rejects.toThrow(name);
        await writeFile(join(root, name), 'owned source');
        await expect(assertReleaseBoundary(root, [name])).resolves.toBeUndefined();
      }
      await writeFile(join(root, 'tests/release-boundary.test.ts'), "const key = '" + 'a'.repeat(80) + "';");
      await expect(assertReleaseBoundary(root, ['tests/release-boundary.test.ts'])).resolves.toBeUndefined();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('rejects noncanonical publication paths', async () => {
    for (const name of ['../app/source.ts', '/app/source.ts', 'app/../lib/source.ts', 'app//source.ts', 'app\\source.ts']) {
      await expect(assertReleaseBoundary('.', [name])).rejects.toThrow();
    }
  });
  it('requires every Docker exclusion while preserving owned migration SQL', () => {
    const patterns = ['.env*', '*.sql', '*.dump', '*.bak', '*.pem', '.secrets', '.runtime/',
      '.maintenance-pg/', '.backend-pg/', '.auth-race-pg/', '.operator-db-test-*/', '.install-test-*/', '.maintenance-pg-synthetic-output'];
    const lines = [...patterns, '!migrations/', '!migrations/*.sql'];
    expect(() => assertDockerBoundary(lines.join('\n'))).not.toThrow();
    for (const pattern of patterns) {
      expect(() => assertDockerBoundary(lines.filter(line => line !== pattern).join('\n'))).toThrow(pattern);
    }
    expect(() => assertDockerBoundary(patterns.join('\n'))).toThrow('migrations');
    expect(() => assertDockerBoundary(lines.join('\n') + '\n!.runtime/')).toThrow();
    // Require explicit post-deny opt-in, then check Docker's root-relative
    // matching and last-match-wins behavior (including parent matches).
    expect(() => assertDockerBoundary(['!migrations/', '!migrations/*.sql', ...patterns].join('\n'))).toThrow('migration');
    expect(() => assertDockerBoundary([...lines, '*.sql'].join('\n'))).toThrow('migration');
    expect(() => assertDockerBoundary([...lines, 'migrations/'].join('\n'))).toThrow('migration');
    expect(() => assertDockerBoundary([...lines, 'migrations/001_initial.sql'].join('\n'))).toThrow('migration');
    expect(() => assertDockerBoundary([...lines, '*.sql', '!migrations/*.sql'].join('\n'))).not.toThrow();
    expect(() => assertDockerBoundary([...lines, '*.sql', '!migrations/'].join('\n'))).not.toThrow();
    expect(() => assertDockerBoundary([...lines, 'migrations/*.sql'].join('\n'))).toThrow('migration');
    expect(() => assertDockerBoundary([...lines, '**/*.sql'].join('\n'))).toThrow('migration');
    expect(() => assertDockerBoundary([...lines, 'migrations/', '!migrations/*.sql'].join('\n'))).not.toThrow();
    expect(() => assertDockerBoundary([...lines, 'migrations/*.sql', '!migrations/'].join('\n'))).not.toThrow();
    expect(() => assertDockerBoundary([...lines, '001_initial.sql', '*.log', '# trailing comment'].join('\n'))).not.toThrow();
  });
});
