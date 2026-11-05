import {describe,it,expect,vi,afterEach} from 'vitest';
import {getGlobalStats,getRelatedIps} from '../lib/db';
import {MOCK_IP_CACHE,MOCK_IP_EVENTS} from '../lib/mock-data';
afterEach(()=>vi.useRealTimers());
describe('mock statistics match SQL definitions',()=>{
 it('uses actual 30-day events and excludes future timestamps from each window',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-01-31T00:00:00Z'));
  const before=MOCK_IP_EVENTS.splice(0),fixtures=[{...before[0],seen_at:'2025-01-01T00:00:00Z'},{...before[0],seen_at:'2026-02-01T00:00:00Z'},{...before[0],seen_at:'2026-01-30T23:00:00Z'}];MOCK_IP_EVENTS.push(...fixtures);
  try{expect(await getGlobalStats()).toMatchObject({events24h:1,events7d:1,events30d:1});}finally{MOCK_IP_EVENTS.splice(0,MOCK_IP_EVENTS.length,...before);}
 });
 it('counts VT-only malicious cache records identically to SQL',async()=>{
  const baseline=await getGlobalStats(),row={...MOCK_IP_CACHE[0],ip:'198.51.100.249',abuse_score:null,vt_malicious:6};MOCK_IP_CACHE.push(row);
  try{expect((await getGlobalStats()).maliciousCount).toBe(baseline.maliciousCount+1);}finally{MOCK_IP_CACHE.splice(MOCK_IP_CACHE.indexOf(row),1);}
 });
 it('does not correlate unrelated null ISPs or approximate subnet string slices',async()=>{
  const row={...MOCK_IP_CACHE[0],ip:'198.51.10.2',isp:null};MOCK_IP_CACHE.push(row);
  try{expect((await getRelatedIps('198.51.100.1','198.51.100.0/24',null)).some(r=>r.ip===row.ip)).toBe(false);}finally{MOCK_IP_CACHE.splice(MOCK_IP_CACHE.indexOf(row),1);}
 });
});
