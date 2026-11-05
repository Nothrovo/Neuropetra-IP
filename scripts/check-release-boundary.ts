#!/usr/bin/env -S npx tsx
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { assertDockerBoundary, assertReleaseBoundary } from '../lib/release-boundary';

async function main() {
  const paths = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
    .split('\0').filter(Boolean);
  // Generated graph output is not publication source. Every other Git-visible path
  // must satisfy the application-owned allowlist, including newly added tests.
  const source = [...new Set(paths)].filter(path => !path.startsWith('graphify-out/'));
  await assertReleaseBoundary(process.cwd(), source);
  assertDockerBoundary(readFileSync('.dockerignore', 'utf8'));
  console.log(`Release source boundary passed for ${source.length} paths; history and credential rotation require operator review.`);
}
main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Release boundary failed');
  process.exitCode = 1;
});
