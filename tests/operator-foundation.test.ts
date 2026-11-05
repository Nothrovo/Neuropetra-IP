import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
describe('operator foundation',()=>{
 it('generates unique restricted scoped runtime secrets without printing them and refuses overwrite',()=>{
  const temp=mkdtempSync(join(process.cwd(),'.install-test-'));
  try {
   const output=execFileSync('node',['scripts/install.mjs','--directory',temp,'--host','postgres'],{encoding:'utf8'});
   const auth=readFileSync(join(temp,'auth-database-url'),'utf8');
   const reader=readFileSync(join(temp,'read-database-url'),'utf8');
   expect(auth).toContain('@postgres:5432/ip_intel');expect(auth).not.toBe(reader);
   expect(auth).toContain('ip_intel_auth_login');
   expect(statSync(join(temp,'auth-database-url')).mode & 0o777).toBe(0o600);
   expect(statSync(temp).mode & 0o777).toBe(0o700);
   expect(output).not.toContain(new URL(auth.trim()).password);
   expect(()=>execFileSync('node',['scripts/install.mjs','--directory',temp],{stdio:'pipe'})).toThrow();
   expect(readFileSync(join(temp,'auth-database-url'),'utf8')).toBe(auth);
  }finally{rmSync(temp,{recursive:true,force:true});}
 });
 it('ships loopback app-only Compose and a private persistent DB overlay, without embedded passwords or privileged app role',()=>{
  const base=readFileSync('docker-compose.yml','utf8');const overlay=readFileSync('compose.postgres.yml','utf8');
  expect(base).toContain('127.0.0.1:');expect(base).not.toMatch(/network_mode: host|postgres:/);
  expect(overlay).toContain('postgres:16-alpine');expect(overlay).toContain('pgdata:');
  expect(overlay).not.toMatch(/ports:|POSTGRES_PASSWORD:/);expect(overlay).toContain('POSTGRES_PASSWORD_FILE');
  expect(base).toContain('AUTH_DATABASE_URL_FILE');expect(base).not.toContain('AUTH_PASS');
  const docker=readFileSync('Dockerfile','utf8');expect(docker).not.toContain('COPY . .');
  expect(docker).toContain('USER nextjs');
 });
});
