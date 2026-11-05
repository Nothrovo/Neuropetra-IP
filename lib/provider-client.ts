import { z } from 'zod';
import { readSecret } from './config';
import { isGlobalIp, normalizeIp } from './ip-validator';
export const REPUTATION_TTL_HOURS = 168;
export function isReputationFresh(checkedAt:string|null,now=new Date(),ttlHours=REPUTATION_TTL_HOURS):boolean {
 const age=checkedAt?now.getTime()-Date.parse(checkedAt):NaN;
 return Number.isFinite(age)&&age>=0&&age<ttlHours*3600000;
}
export class ProviderError extends Error { constructor(public code:'disabled'|'non_global'|'rate_limited'|'invalid_response'|'timeout'|'cancelled'|'unavailable',message:string){super(message);} }
const providerSchema=z.object({
 ipAddress:z.string(),abuseConfidenceScore:z.number().int().min(0).max(100),
 countryCode:z.string().regex(/^[A-Z]{2}$/).nullish(),isp:z.string().max(512).nullish(),domain:z.string().max(512).nullish(),usageType:z.string().max(256).nullish(),
 totalReports:z.number().int().nonnegative().optional(),numDistinctUsers:z.number().int().nonnegative().optional(),lastReportedAt:z.string().datetime({offset:true}).nullish(),isTor:z.boolean().optional(),isWhitelisted:z.boolean().nullish()
});
export interface ProviderResult {ip:string;abuseScore:number;countryCode:string|null;isp:string|null;checkedAt:string;metadata:z.infer<typeof providerSchema>}
/** The optional fetch dependency is test-only explicit interception, never selected from user input. */
export async function lookupReputation(input:string,signal?:AbortSignal,dependencies?:{fetch:typeof fetch;timeoutMs?:number}):Promise<ProviderResult> {
 const ip=normalizeIp(input);
 if(!isGlobalIp(ip))throw new ProviderError('non_global','External lookup requires global unicast');
 let apiKey:string|undefined;
 try{apiKey=readSecret('ABUSEIPDB_API_KEY')?.trim();}catch{throw new ProviderError('disabled','External enrichment is disabled or not configured');}
 if(process.env.ENABLE_EXTERNAL_ENRICHMENT!=='true'||!apiKey||(process.env.USE_MOCK_DATA==='true'&&!dependencies))throw new ProviderError('disabled','External enrichment is disabled or not configured');
 if(signal?.aborted)throw new ProviderError('cancelled','Lookup cancelled');
 const controller=new AbortController();let timedOut=false;
 const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},dependencies?.timeoutMs??8000);
 try {
  const response=await (dependencies?.fetch??fetch)(`https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`,{method:'GET',headers:{Key:apiKey,Accept:'application/json'},signal:controller.signal,redirect:'error',cache:'no-store'});
  if(response.status===429)throw new ProviderError('rate_limited','Provider quota or rate limit reached');
  if(!response.ok)throw new ProviderError('unavailable','Provider lookup failed');
  // Bound response size as well as duration; do not persist provider raw error content.
  const reader=response.body?.getReader();const chunks:Uint8Array[]=[];let bytes=0;
  if(reader)while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>65536){await reader.cancel();throw new ProviderError('invalid_response','Provider response too large');}chunks.push(value);}
  let parsed:unknown;try{parsed=JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));}catch{throw new ProviderError('invalid_response','Invalid provider response');}
  const result=z.object({data:providerSchema}).safeParse(parsed);
  if(!result.success||normalizeIp(result.data.data.ipAddress)!==ip)throw new ProviderError('invalid_response','Invalid provider response');
  const metadata=result.data.data;
  return {ip,abuseScore:metadata.abuseConfidenceScore,countryCode:metadata.countryCode??null,isp:metadata.isp??null,metadata,checkedAt:new Date().toISOString()};
 } catch(error) {
  if(timedOut)throw new ProviderError('timeout','Provider lookup timed out');
  if(signal?.aborted)throw new ProviderError('cancelled','Lookup cancelled');
  if(error instanceof ProviderError)throw error;
  throw new ProviderError('unavailable','Provider lookup failed');
 } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
