import { getIpIntel,upsertIpIntelReputation } from '@/lib/db';
import { isGlobalIp } from '@/lib/ip-validator';
import { calculateVerdictScore } from '@/lib/scoring';
import { getFullCountryName } from '@/lib/charlie-ioc-formatter';
import { checkRateLimit } from '@/lib/rate-limit';
import { withApiPermission } from '@/lib/authorization';
import { apiError,ApiInputError,parseIpBatch,readJsonBody } from '@/lib/api-input';
import { lookupReputation,isReputationFresh,ProviderError } from '@/lib/provider-client';
export interface EnrichedIpResult {
 ip:string;source:'cache'|'abuseipdb_live'|'local_private';status:'cached'|'enriched'|'private'|'rate_limited'|'error';
 abuseScore:number|null;compositeScore:number;verdict:'Malicious'|'Suspicious'|'Low risk'|'Unknown';verdictColor:'red'|'amber'|'emerald'|'slate';
 countryCode:string|null;countryName:string|null;isp:string|null;domain:string|null;usageType:string|null;totalReports:number;numDistinctUsers:number;lastReportedAt:string|null;isTor:boolean;isWhitelisted:boolean;savedToDb:boolean;checkedAt:string|null;error?:string|null;scoreContext:'reputation-only';reputationSource:'abuseipdb'|null;
}
function empty(ip:string):EnrichedIpResult {return {ip,source:'abuseipdb_live',status:'error',abuseScore:null,compositeScore:0,verdict:'Unknown',verdictColor:'slate',countryCode:null,countryName:null,isp:null,domain:null,usageType:null,totalReports:0,numDistinctUsers:0,lastReportedAt:null,isTor:false,isWhitelisted:false,savedToDb:false,checkedAt:null,scoreContext:'reputation-only',reputationSource:null};}
function text(value:unknown):string|null{return typeof value==='string'?value:null;}
export const POST=withApiPermission(async(request,_context,session)=>{
 if(!checkRateLimit(`enrich:${session.userId}`,30,0.5).allowed)return Response.json({error:'Rate limit exceeded'},{status:429});
 try {
  const body=await readJsonBody(request),ips=parseIpBatch(body,100);
  if(body.checkCacheFirst!==undefined&&typeof body.checkCacheFirst!=='boolean')throw new ApiInputError('checkCacheFirst must be boolean');
  if('apiKey' in body)throw new ApiInputError('Provider keys must be configured by the operator');
  const results:EnrichedIpResult[]=[];
  for(const ip of ips){
   const base=empty(ip);
   if(!isGlobalIp(ip)){results.push({...base,source:'local_private',status:'private',error:'Non-global indicator; no external lookup performed'});continue;}
   try {
    if(body.checkCacheFirst!==false){
     const cached=await getIpIntel(ip);
     if(cached&&cached.reputation_source==='abuseipdb'&&cached.abuse_score!==null&&isReputationFresh(cached.reputation_checked_at)){
      const rep=cached.reputation_json??{},score=calculateVerdictScore({abuseScore:cached.abuse_score});
      results.push({...base,source:'cache',status:'cached',abuseScore:cached.abuse_score,compositeScore:score.compositeScore,verdict:score.verdict,verdictColor:score.verdictColor,countryCode:cached.country_code,countryName:getFullCountryName(cached.country_code),isp:cached.isp,domain:text(rep.domain),usageType:text(rep.usageType),totalReports:typeof rep.totalReports==='number'?rep.totalReports:0,numDistinctUsers:typeof rep.numDistinctUsers==='number'?rep.numDistinctUsers:0,lastReportedAt:text(rep.lastReportedAt),isTor:rep.isTor===true,isWhitelisted:rep.isWhitelisted===true,savedToDb:true,checkedAt:cached.reputation_checked_at,reputationSource:'abuseipdb'});continue;
     }
    }
    const live=await lookupReputation(ip,request.signal),meta=live.metadata,score=calculateVerdictScore({abuseScore:live.abuseScore});
    let savedToDb=false;let persistenceError:string|null=null;
    try {await upsertIpIntelReputation({ip,abuseScore:live.abuseScore,countryCode:live.countryCode,isp:live.isp,reputationJson:meta,geoJson:{country:getFullCountryName(live.countryCode),countryCode:live.countryCode,isp:live.isp},checkedAt:live.checkedAt});savedToDb=true;}catch{persistenceError='Provider result retrieved but reputation persistence failed';}
    results.push({...base,status:'enriched',abuseScore:live.abuseScore,compositeScore:score.compositeScore,verdict:score.verdict,verdictColor:score.verdictColor,countryCode:live.countryCode,countryName:getFullCountryName(live.countryCode),isp:live.isp,domain:meta.domain??null,usageType:meta.usageType??null,totalReports:meta.totalReports??0,numDistinctUsers:meta.numDistinctUsers??0,lastReportedAt:meta.lastReportedAt??null,isTor:meta.isTor??false,isWhitelisted:meta.isWhitelisted??false,savedToDb,checkedAt:live.checkedAt,reputationSource:'abuseipdb',error:persistenceError});
   }catch(error){results.push({...base,status:error instanceof ProviderError&&error.code==='rate_limited'?'rate_limited':'error',error:error instanceof ProviderError?error.message:'Local reputation lookup failed'});}
  }
  return Response.json({success:true,totalRequested:ips.length,cachedCount:results.filter(r=>r.status==='cached').length,enrichedCount:results.filter(r=>r.status==='enriched').length,savedCount:results.filter(r=>r.status==='enriched'&&r.savedToDb).length,errorCount:results.filter(r=>r.status==='error'||r.status==='rate_limited'||r.error&&r.status==='enriched').length,results});
 }catch(error){return apiError(error);}
},'enrich');
