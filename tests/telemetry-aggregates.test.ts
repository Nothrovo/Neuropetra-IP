import { beforeAll, describe, expect, it } from 'vitest';
import { MOCK_IP_CACHE, MOCK_IP_EVENTS, type IpIntelEventRow } from '../lib/mock-data';
import { getIpSummary } from '../lib/telemetry-aggregates';
import { getIpEvents, getIpIntel, upsertIpIntelReputation } from '../lib/db';
const scope = {from:'2026-01-01T00:00:00.000Z',to:'2026-01-03T00:00:00.000Z',targetHost:'included'};
describe('scope independent of evidence pagination', () => {
 beforeAll(()=>{process.env.USE_MOCK_DATA='true';});
 it('finds critical evidence past page 50 and excludes negative scope fixtures',async()=>{
  const base:IpIntelEventRow={id:90000,ip:'198.51.100.200',seen_at:'2026-01-02T00:00:00.000Z',alert_type:'attack',attack_subtype:null,mitre:[],target_host:'included',endpoint:null,outcome:'blocked',raw_summary:'synthetic'};
  const fixtures=Array.from({length:65},(_,i)=>({...base,id:90000+i}));
  fixtures.push({...base,id:90100,seen_at:scope.from,outcome:'compromised'}, {...base,id:90101,seen_at:scope.to,outcome:'success'}, {...base,id:90102,target_host:'excluded',outcome:'success'});
  MOCK_IP_EVENTS.push(...fixtures);
  try {
   const summary=await getIpSummary(base.ip,scope);
   expect(summary.eventCount).toBe(66); expect(summary.hasCriticalOutcome).toBe(true); expect(summary.timeline.reduce((s,r)=>s+r.count,0)).toBe(66);
   const page=await getIpEvents(base.ip,{...scope,limit:15,offset:0});
   expect(summary.latestEvent?.id).toBe(90064);
   expect(page.total).toBe(66); expect(page.events).toHaveLength(15); expect(page.events.every(e=>e.target_host==='included'&&e.seen_at<scope.to)).toBe(true);
   expect(await getIpSummary(base.ip,scope)).toEqual(summary);
  } finally {for(const f of fixtures) MOCK_IP_EVENTS.splice(MOCK_IP_EVENTS.indexOf(f),1);}
 });
 it('reputation writes cannot change telemetry and reputation-only rows have no observed timestamps',async()=>{
  const original=structuredClone(MOCK_IP_CACHE[0]);
  await upsertIpIntelReputation({ip:original.ip,abuseScore:23});
  expect(MOCK_IP_CACHE[0]).toEqual(original);
  expect((await getIpIntel(original.ip))?.abuse_score).toBe(23);
  await upsertIpIntelReputation({ip:'198.51.100.201',abuseScore:0});
  const only=await getIpIntel('198.51.100.201');
  expect(only).toMatchObject({first_seen:null,last_seen:null,total_alert_count:0,abuse_score:0});
  expect(MOCK_IP_CACHE.some(r=>r.ip==='198.51.100.201')).toBe(false);
 });
});
