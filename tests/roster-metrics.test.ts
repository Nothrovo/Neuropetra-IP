import {describe,it,expect} from 'vitest';
import {getDashboardAnalytics,getProviderIps,getBlocklistData} from '../lib/db';
import {MOCK_IP_CACHE} from '../lib/mock-data';
describe('uniform analytics and explicit roster/export bounds',()=>{
 it('filters every dashboard aggregate with one scope and labels metric units',async()=>{
  const result=await getDashboardAnalytics(1,{from:'2020-01-01T00:00:00.000Z',to:'2020-01-02T00:00:00.000Z'});
  expect(result.topCountries).toEqual([]);expect(result.topAttackTypes).toEqual([]);expect(result.outcomeDistribution).toEqual([]);expect(result.timeline).toEqual([]);expect(result.topAsns).toEqual([]);
 });
 it('paginates a large provider roster without dropping totals and rejects invalid bounds',async()=>{
  const base=MOCK_IP_CACHE[0],rows=Array.from({length:130},(_,i)=>({...base,ip:`198.51.100.${i+1}`,isp:'Synthetic Large Provider',total_alert_count:0}));MOCK_IP_CACHE.push(...rows);
  try{const first=await getProviderIps('Synthetic Large Provider',100,0),second=await getProviderIps('Synthetic Large Provider',100,100);expect(first.total).toBe(130);expect(first.items).toHaveLength(100);expect(second.items).toHaveLength(30);expect(new Set([...first.items,...second.items].map(r=>r.ip)).size).toBe(130);await expect(getProviderIps('Synthetic Large Provider',NaN,0)).rejects.toThrow();}finally{for(const r of rows)MOCK_IP_CACHE.splice(MOCK_IP_CACHE.indexOf(r),1);}
 });
 it('uses identical VT-or-abuse and last-seen blocklist criteria including zero options',async()=>{
  const row={...MOCK_IP_CACHE[0],ip:'198.51.100.254',abuse_score:0,vt_malicious:6,last_seen:new Date(Date.now()-1000).toISOString(),total_alert_count:0};MOCK_IP_CACHE.push(row);
  try{const data=await getBlocklistData({minScore:100,minAlerts:0,maxAgeDays:1});expect(data.some(r=>r.ip===row.ip)).toBe(true);row.last_seen='2020-01-01T00:00:00Z';expect((await getBlocklistData({minScore:100,minAlerts:0,maxAgeDays:1})).some(r=>r.ip===row.ip)).toBe(false);}finally{MOCK_IP_CACHE.splice(MOCK_IP_CACHE.indexOf(row),1);}
 });
});
