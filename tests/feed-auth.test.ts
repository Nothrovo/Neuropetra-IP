import {describe,it,expect,vi} from 'vitest';
const {query}=vi.hoisted(()=>({query:vi.fn()}));
vi.mock('../lib/db-pool',()=>({getAuthPool:()=>({query})}));
import {requireFeedToken} from '../lib/feed-auth';
import {createHash} from 'node:crypto';
describe('scoped machine feed authorization',()=>{
 it('fails missing/random bearer before DB and stores/queries only hashes',async()=>{
  for(const authorization of ['', 'Bearer bad'])await expect(requireFeedToken(new Request('http://localhost',{headers:{authorization}}))).rejects.toMatchObject({status:401});
  expect(query).not.toHaveBeenCalled();
  const token='a'.repeat(43);query.mockResolvedValueOnce({rows:[{id:'synthetic-token',scopes:['feed:read']} ]});
  expect(await requireFeedToken(new Request('http://localhost',{headers:{authorization:`Bearer ${token}`}}))).toEqual({id:'synthetic-token'});
  expect(query.mock.calls[0][1]).toEqual([createHash('sha256').update(token).digest('hex')]);
  expect(query.mock.calls[0][0]).toContain('revoked_at IS NULL');expect(query.mock.calls[0][0]).toContain('expires_at > now()');
 });
 it('rejects revoked/expired tokens and wrong scopes',async()=>{
  const req=new Request('http://localhost',{headers:{authorization:'Bearer '+'b'.repeat(43)}});
  query.mockResolvedValueOnce({rows:[]});await expect(requireFeedToken(req)).rejects.toMatchObject({status:401});
  query.mockResolvedValueOnce({rows:[{id:'wrong',scopes:['read']}]});await expect(requireFeedToken(req)).rejects.toMatchObject({status:403});
 });
});
