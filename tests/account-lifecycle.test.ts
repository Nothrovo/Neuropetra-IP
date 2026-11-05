import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { closePools, getAuthPool } from '../lib/db-pool';
import { completeBootstrap, createBootstrapToken, getInstallationState } from '../lib/bootstrap';
import { AUTH_COOKIE_NAME, hashPassword, verifyPassword, login, requireSession, revokeSession } from '../lib/auth';

beforeAll(async () => {
 if(process.env.RUN_DATABASE_TESTS !== '1')return;
 const env = readFileSync('.secrets/review-db.env','utf8');
 const password = env.match(/^POSTGRES_PASSWORD=(.+)$/m)?.[1]?.trim();
 if (!password) throw new Error('Synthetic test DB secret missing');
 process.env.AUTH_DATABASE_URL=`postgresql://postgres:${encodeURIComponent(password)}@127.0.0.1:55437/ip_intel_test`;
 await getAuthPool().query('TRUNCATE ip_intel_sessions,ip_intel_users,ip_intel_auth_attempts');
 await getAuthPool().query('UPDATE ip_intel_installation SET installed_at=NULL,bootstrap_hash=NULL,bootstrap_expires_at=NULL');
});
afterAll(closePools);
const password='synthetic account passphrase 🦉';
const request=(token:string) => new Request('http://127.0.0.1:3000/api/test',{headers:{cookie:`${AUTH_COOKIE_NAME}=${token}`}});
describe.skipIf(process.env.RUN_DATABASE_TESTS !== '1')('first administrator and opaque server sessions',()=>{
 it('uses unique salted scrypt hashes and bounds password lengths without trimming',async()=>{
  const first=await hashPassword(password); const second=await hashPassword(password);
  expect(first).not.toBe(second); expect(first).not.toContain(password);
  expect(first).toMatch(/^scrypt\$131072\$8\$1\$/);
  expect(await verifyPassword(password, first)).toBe(true);
  expect(await verifyPassword(password+'x', first)).toBe(false);
  expect(await verifyPassword(password, 'broken')).toBe(false);
  await expect(hashPassword('x'.repeat(14))).rejects.toMatchObject({status:400});
  await expect(hashPassword('x'.repeat(129))).rejects.toMatchObject({status:400});
  expect(await verifyPassword(' '.repeat(15),await hashPassword(' '.repeat(15)))).toBe(true);
 });
 it('cannot log in before explicit authorized bootstrap and stores no raw bootstrap token',async()=>{
  expect(await getInstallationState()).toBe('setup-required');
  await expect(login('first-admin',password)).rejects.toMatchObject({status:401});
  await expect(completeBootstrap({token:'x'.repeat(43),username:'first-admin',password})).rejects.toMatchObject({status:403});
  const token=await createBootstrapToken();
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const {rows}=await getAuthPool().query('SELECT bootstrap_hash FROM ip_intel_installation');
  expect(rows[0].bootstrap_hash).toBe(createHash('sha256').update(token).digest('hex'));
  await getAuthPool().query("UPDATE ip_intel_installation SET bootstrap_expires_at=now()-interval '1 second'");
  await expect(completeBootstrap({token,username:'first-admin',password})).rejects.toMatchObject({status:403});
 });
 it('atomically creates exactly one first admin, consumes token, and stays installed after all accounts are removed',async()=>{
  const token=await createBootstrapToken();
  const results=await Promise.allSettled([completeBootstrap({token,username:'first-admin',password}),completeBootstrap({token,username:'second-admin',password})]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect((await getAuthPool().query('SELECT count(*) FROM ip_intel_users')).rows[0].count).toBe('1');
  expect(await getInstallationState()).toBe('ready');
  await expect(createBootstrapToken()).rejects.toMatchObject({status:409});
  await expect(completeBootstrap({token,username:'third-admin',password})).rejects.toMatchObject({status:409});
 });
 it('rejects missing/forged/expired/revoked cookies while loading current role from DB',async()=>{
  const user=(await getAuthPool().query('SELECT username FROM ip_intel_users')).rows[0];
  const created=await login(user.username,password);
  expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(created.session.role).toBe('admin');
  const session=await requireSession(request(created.token));
  expect(session.username).toBe(user.username);
  const row=(await getAuthPool().query('SELECT token_hash FROM ip_intel_sessions')).rows[0];
  expect(row.token_hash).not.toBe(created.token);
  await expect(requireSession(new Request('http://localhost'))).rejects.toMatchObject({status:401});
  await expect(requireSession(request(Buffer.from(JSON.stringify({role:'admin'})).toString('base64')))).rejects.toMatchObject({status:401});
  await expect(requireSession(request('x'.repeat(43)))).rejects.toMatchObject({status:401});
  await getAuthPool().query("UPDATE ip_intel_users SET role='analyst'");
  expect((await requireSession(request(created.token))).role).toBe('analyst');
  await revokeSession(session);
  await expect(requireSession(request(created.token))).rejects.toMatchObject({status:401});
  const next=await login(user.username,password);
  await getAuthPool().query("UPDATE ip_intel_sessions SET expires_at=now()-interval '1 second'");
  await expect(requireSession(request(next.token))).rejects.toMatchObject({status:401});
  await getAuthPool().query('DELETE FROM ip_intel_users');
  expect(await getInstallationState()).toBe('ready');
  await expect(createBootstrapToken()).rejects.toMatchObject({status:409});
 });
});
