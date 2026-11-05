import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupReputation, isReputationFresh } from '../lib/provider-client';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const fixtureRoot = join(process.cwd(), '.provider-test-secrets');
let secretDirectory: string | undefined;
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();if(secretDirectory)rmSync(secretDirectory,{recursive:true,force:true});secretDirectory=undefined;});
function enable(){vi.stubEnv('ENABLE_EXTERNAL_ENRICHMENT','true');vi.stubEnv('ABUSEIPDB_API_KEY','synthetic-key-only');}
describe('provider egress and schema boundary',()=>{
 it('never fetches disabled, missing-key, non-global, or mock mode even when enabled',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  vi.stubEnv('USE_MOCK_DATA','false');vi.stubEnv('ENABLE_EXTERNAL_ENRICHMENT','false');
  await expect(lookupReputation('8.8.8.8')).rejects.toThrow();
  enable();vi.stubEnv('ABUSEIPDB_API_KEY','');await expect(lookupReputation('8.8.8.8')).rejects.toThrow();
  enable();for(const ip of ['fc00::1','100.64.0.1','::ffff:10.0.0.1'])await expect(lookupReputation(ip)).rejects.toThrow();
  vi.stubEnv('USE_MOCK_DATA','true');await expect(lookupReputation('8.8.8.8')).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
 });
 it('validates provider schema, preserves known zero and rejects missing score and wrong IP',async()=>{
  enable();vi.stubEnv('USE_MOCK_DATA','true');
  const interceptedFetch=vi.fn(async()=>Response.json({data:{ipAddress:'8.8.8.8',abuseConfidenceScore:0,countryCode:'US',totalReports:0}}));
  const result=await lookupReputation('8.8.8.8',undefined,{fetch:interceptedFetch});expect(result.abuseScore).toBe(0);
  for(const data of [{ipAddress:'8.8.8.8'},{ipAddress:'1.1.1.1',abuseConfidenceScore:5},{ipAddress:'8.8.8.8',abuseConfidenceScore:101}])await expect(lookupReputation('8.8.8.8',undefined,{fetch:async()=>Response.json({data})})).rejects.toThrow();
 });
 it('bounds timeout, propagates cancellation, handles 429 without raw provider leakage',async()=>{
  enable();vi.stubEnv('USE_MOCK_DATA','true');
  await expect(lookupReputation('8.8.8.8',undefined,{fetch:async()=>new Response('secret payload',{status:429})})).rejects.toMatchObject({code:'rate_limited'});
  const stalled:typeof fetch=(_url,init)=>new Promise((_resolve,reject)=>{init?.signal?.addEventListener('abort',()=>reject(new Error('aborted')));});
  await expect(lookupReputation('8.8.8.8',undefined,{fetch:stalled,timeoutMs:10})).rejects.toMatchObject({code:'timeout'});
  const controller=new AbortController();controller.abort();await expect(lookupReputation('8.8.8.8',controller.signal,{fetch:stalled})).rejects.toMatchObject({code:'cancelled'});
 });
 it('uses the same key-file configuration as capability detection',async()=>{
  enable();vi.stubEnv('ABUSEIPDB_API_KEY','');vi.stubEnv('USE_MOCK_DATA','true');
  mkdirSync(fixtureRoot,{recursive:true});secretDirectory=mkdtempSync(join(fixtureRoot,'key-'));
  const file=join(secretDirectory,'provider-key');writeFileSync(file,'synthetic-file-key\n',{mode:0o600});
  vi.stubEnv('ABUSEIPDB_API_KEY_FILE',file);
  const intercepted=vi.fn<typeof fetch>(async()=>Response.json({data:{ipAddress:'8.8.8.8',abuseConfidenceScore:0}}));
  expect((await lookupReputation('8.8.8.8',undefined,{fetch:intercepted})).abuseScore).toBe(0);
  expect(new Headers(intercepted.mock.calls[0]?.[1]?.headers).get('Key')).toBe('synthetic-file-key');
 });
 it('shares 168h freshness and rejects invalid or future timestamps',()=>{
  const now=new Date('2026-01-08T00:00:00Z');expect(isReputationFresh('2026-01-01T00:00:01Z',now)).toBe(true);expect(isReputationFresh('2026-01-01T00:00:00Z',now)).toBe(false);
  for(const value of [null,'bad','2026-02-01T00:00:00Z'])expect(isReputationFresh(value,now)).toBe(false);
 });
});
