import { describe, expect, it } from 'vitest';
import { readJsonBody, parseIpBatch, integerParam, parseTelemetryScope } from '../lib/api-input';

describe('bounded API input', () => {
  it('rejects malformed and oversized bodies before downstream work', async () => {
    await expect(readJsonBody(new Request('http://localhost',{method:'POST',body:'{'}))).rejects.toMatchObject({status:400});
    await expect(readJsonBody(new Request('http://localhost',{method:'POST',body:JSON.stringify({text:'x'.repeat(70000)})}))).rejects.toMatchObject({status:413});
  });
  it('rejects nonstrings, malformed indicators and oversized batches instead of filtering/truncating', () => {
    for (const body of [{ips:[1]}, {ips:['bad']},{ips:['8.8.8.8/32']},{ips:Array(201).fill('8.8.8.8')}]) expect(()=>parseIpBatch(body,200)).toThrow();
    expect(parseIpBatch({ips:[' 8.8.8.8 ','8.8.8.8','2001:4860:0:0::1']},200)).toEqual(['8.8.8.8','2001:4860::1']);
  });
  it('rejects NaN, partial integers, empty and negative pagination', () => {
    for(const value of ['NaN','1x','-1','','1.2','101']) expect(()=>integerParam(new URLSearchParams({limit:value}),'limit',20,1,100)).toThrow();
  });
  it('uses explicit UTC half-open scope and rejects invalid timestamps', () => {
    expect(parseTelemetryScope(new URLSearchParams({days:'7'}),new Date('2026-01-08T00:00:00Z'))).toMatchObject({from:'2026-01-01T00:00:00.000Z',to:'2026-01-08T00:00:00.000Z'});
    for(const from of ['yesterday','2026-02-30T00:00:00Z','2026-01-01']) expect(()=>parseTelemetryScope(new URLSearchParams({from,to:'2026-04-01T00:00:00Z'}))).toThrow();
  });
});
