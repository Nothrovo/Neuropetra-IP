import { lstat, readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { resolve, relative, isAbsolute, matchesGlob, posix } from 'node:path';

// These are application-owned publication roots, not all Git-visible files.
const rootFiles = new Set([
  '.dockerignore', '.gitignore', '.npmrc', '.env.example', 'AGENTS.md', 'CLAUDE.md',
  'CONTRIBUTING.md', 'SECURITY.md', 'README.md', 'Dockerfile', 'docker-compose.yml',
  'compose.maintenance.yml', 'compose.operator.yml', 'compose.postgres.yml',
  'eslint.config.mjs', 'next.config.ts', 'package.json', 'pnpm-lock.yaml',
  'pnpm-workspace.yaml', 'postcss.config.mjs', 'proxy.ts', 'tsconfig.json',
  'playwright.config.ts', 'vitest.config.ts',
]);
const scripts = new Set([
  'scripts/account.ts', 'scripts/check-release-boundary.ts', 'scripts/db-bootstrap.mjs',
  'scripts/install.mjs', 'scripts/maintenance-worker.mjs', 'scripts/migrate.mjs',
  'scripts/provision-bundled.mjs',
]);
// Only these reviewed tests may contain intentionally synthetic credential markers.
const syntheticCredentialFixtures = new Set(['tests/release-boundary.test.ts']);
function approved(name: string): boolean {
  if (/(^|\/)(?:\.secrets|\.runtime|\.maintenance-pg|\.backend-pg|\.auth-race-pg|\.operator-db-test-[^/]*|\.install-test-[^/]*|\.env[^/]*|\.maintenance-pg-synthetic-output)(?:\/|$)/.test(name) && name !== '.env.example') return false;
  return rootFiles.has(name) || scripts.has(name) || name === 'app/favicon.ico' ||
    /^(?:app|components|lib)\/(?:[^/]+\/)*[^/]+\.(?:[cm]?[jt]sx?|css)$/.test(name) ||
    /^docs\/(?:[^/]+\/)*[^/]+\.md$/.test(name) ||
    /^tests\/(?:[^/]+\/)*[^/]+\.(?:[cm]?[jt]sx?|json)$/.test(name) ||
    /^public\/(?:[^/]+\/)*[^/]+\.svg$/.test(name) ||
    /^migrations\/\d+_[a-z0-9_]+\.sql$/.test(name) ||
    /^\.github\/workflows\/[^/]+\.ya?ml$/.test(name);
}

/** Validate every explicit publication path before reading any approved source. */
export async function assertReleaseBoundary(root: string, paths: string[]): Promise<void> {
  const failures: string[] = [];
  for (const name of paths) {
    const full = resolve(root, name);
    const rel = relative(resolve(root), full);
    if (!name || name.includes('\\') || name !== rel || isAbsolute(rel) ||
      rel.split('/').some(part => part === '..' || part === '.') || !approved(name)) {
      failures.push(name); continue;
    }
    try {
      // Reject symlinks in every component, including approved directory roots.
      let current = resolve(root);
      const parts = name.split('/');
      for (const [index, part] of parts.entries()) {
        current = resolve(current, part);
        const stat = await lstat(current);
        if (stat.isSymbolicLink() || (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory())) {
          throw new Error('Invalid publication entry');
        }
      }
      if (name === 'app/favicon.ico' || syntheticCredentialFixtures.has(name)) continue;
      const content = await readFile(full, 'utf8');
      const embeddedCredential = [...content.matchAll(/postgres(?:ql)?:\/\/[^\s'"`]+:([^\s'"`@]+)@/g)]
        .some(match => !match[1].includes('${'));
      if (/(['"])[a-f0-9]{64,}\1/i.test(content) || embeddedCredential) failures.push(name);
    } catch {
      // Never expose content, credential values, or filesystem exception details.
      failures.push(name);
    }
  }
  if (failures.length) throw new Error('Publication boundary rejected paths: ' + failures.join(', '));
}

export function assertDockerBoundary(ignore: string): void {
  const ordered = ignore.replace(/^\uFEFF/, '').split(/\r?\n/)
    .filter(line => !line.startsWith('#')).map(line => line.trim()).filter(Boolean);
  const lines = new Set(ordered);
  for (const pattern of ['.env*', '*.sql', '*.dump', '*.bak', '*.pem', '.secrets', '.runtime/',
    '.maintenance-pg/', '.backend-pg/', '.auth-race-pg/', '.operator-db-test-*/', '.install-test-*/', '.maintenance-pg-synthetic-output']) {
    if (!lines.has(pattern)) throw new Error('Missing Docker exclusion: ' + pattern);
  }
  for (const pattern of ['!migrations/', '!migrations/*.sql']) {
    if (!lines.has(pattern)) throw new Error('Missing Docker migration inclusion: ' + pattern);
  }
  // Publication policy requires an explicit migration opt-in after the SQL deny.
  // Docker's bare *.sql is root-relative; this ordering requirement is deliberately
  // stronger than matching that pattern alone against migrations/foo.sql.
  if (Math.max(ordered.lastIndexOf('!migrations/'), ordered.lastIndexOf('!migrations/*.sql')) < ordered.lastIndexOf('*.sql')) {
    throw new Error('Docker migration inclusion must follow SQL exclusion');
  }
  // Only owned schema source may override exclusions; arbitrary negations can expose runtime data.
  for (const line of lines) {
    if (line.startsWith('!') && line !== '!migrations/' && line !== '!migrations/*.sql') {
      throw new Error('Unapproved Docker inclusion: ' + line);
    }
  }
  const migrations = readdirSync(resolve('migrations')).filter(name => /^\d+_[a-z0-9_]+\.sql$/.test(name));
  for (const name of migrations) {
    let excluded = false;
    for (const line of ordered) {
      const inclusion = line.startsWith('!');
      const pattern = posix.normalize(inclusion ? line.slice(1) : line).replace(/^\/+|\/+$/g, '');
      if (pattern === '.') continue;
      // Docker matches the full root-relative path or a parent, never an
      // arbitrary basename. Later negations override earlier matching rules.
      if (matchesGlob(`migrations/${name}`, pattern) || matchesGlob('migrations', pattern)) excluded = !inclusion;
    }
    if (excluded) throw new Error('Docker excludes owned migration: ' + name);
  }
}
