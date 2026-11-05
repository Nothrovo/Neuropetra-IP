import { describe,it,expect,vi,afterEach } from 'vitest';
import { encodeCsvCell, encodeMarkdownCell, serializeFeed } from '../lib/export';
import { createRateLimiter } from '../lib/rate-limit';
afterEach(()=>vi.useRealTimers());
describe('safe export cells',()=>{
 it('quotes separators, double quotes and CRLF and neutralizes spreadsheet formulas',()=>{
  expect(encodeCsvCell('a,"b"\r\nc')).toBe('"a,""b""\r\nc"');
  for(const value of ['=1+1','+cmd','-1','@SUM(1)',' \t=cmd','\r=cmd'])expect(encodeCsvCell(value)).toContain("'");
  expect(encodeCsvCell(null)).toBe('""');expect(encodeMarkdownCell('a|b\n<c>')).toBe('a\\|b &lt;c&gt;');
 });
 it('rejects feed injection and IPv6 CDB instead of writing bad delimiters',()=>{
  expect(()=>serializeFeed([{ip:'8.8.8.8\n1.1.1.1',abuse_score:1,total_alert_count:0,country_code:null,attack_types:[]}],'txt')).toThrow();
  expect(()=>serializeFeed([{ip:'2001:4860::1',abuse_score:1,total_alert_count:0,country_code:null,attack_types:[]}],'cdb')).toThrow(/IPv4/);
  expect(serializeFeed([{ip:'8.8.8.8',abuse_score:0,total_alert_count:0,country_code:'US',attack_types:['x\ny:z']}],'cdb')).not.toContain('\n');
 });
});
describe('bounded limiter',()=>{
 it('does not exceed max keys, evicts TTL entries, and fails closed at saturation',()=>{
  vi.useFakeTimers();vi.setSystemTime(100000);
  const limiter=createRateLimiter({maxKeys:2,ttlMs:1000});
  expect(limiter.check('a',1,0).allowed).toBe(true);expect(limiter.check('a',1,0).allowed).toBe(false);
  expect(limiter.check('b',1,0).allowed).toBe(true);expect(limiter.check('c',1,0).allowed).toBe(false);expect(limiter.size()).toBe(2);
  vi.advanceTimersByTime(1001);expect(limiter.check('c',1,0).allowed).toBe(true);expect(limiter.size()).toBe(1);
 });
});
