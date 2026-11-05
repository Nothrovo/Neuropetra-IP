import { getBulkIntel } from '@/lib/db';
import { calculateVerdictScore } from '@/lib/scoring';
import { withApiPermission } from '@/lib/authorization';
import { readJsonBody,parseIpBatch,apiError,parseTelemetryScope } from '@/lib/api-input';
import { checkRateLimit } from '@/lib/rate-limit';
import { isReputationFresh } from '@/lib/provider-client';
import { getIpSummary } from '@/lib/telemetry-aggregates';
export const POST=withApiPermission(async(request,_context,session)=>{
 if(!checkRateLimit(`bulk:${session.userId}`,30,0.5).allowed)return Response.json({error:'Rate limit exceeded'},{status:429});
 try {
  const ips=parseIpBatch(await readJsonBody(request),200);const rows=await getBulkIntel(ips);const rowMap=new Map(rows.map(r=>[r.ip,r]));
  const scope=parseTelemetryScope(new URLSearchParams());
  const results=await Promise.all(ips.map(async ip=>{
   const row=rowMap.get(ip);
   if(!row)return {ip,found:false,verdict:'Unknown',compositeScore:0,countryCode:null,countryName:null,isp:null,asn:null,totalAlertCount:0,topAttackType:null,lastSeen:null,abuseScore:null,vtMalicious:null,reputationSource:null};
   const summary=await getIpSummary(ip,scope);
   const scoring=calculateVerdictScore({abuseScore:row.abuse_score,vtMalicious:row.vt_malicious,totalAlertCount:summary.eventCount,distinctTargetsCount:summary.distinctTargetsCount,lastSeen:summary.lastSeen,hasCriticalOutcome:summary.hasCriticalOutcome});
   return {ip,found:true,verdict:scoring.verdict,verdictColor:scoring.verdictColor,compositeScore:scoring.compositeScore,countryCode:row.country_code,countryName:row.geo_json?.country??null,isp:row.isp,asn:row.geo_json?.as??row.isp,totalAlertCount:row.total_alert_count,topAttackType:row.attack_types[0]??null,lastSeen:row.last_seen,abuseScore:row.abuse_score,vtMalicious:row.vt_malicious,reputationSource:row.reputation_source,reputationCheckedAt:row.reputation_checked_at,reputationFresh:isReputationFresh(row.reputation_checked_at),scoreScope:scope,telemetryEventCount:summary.eventCount};
  }));
  return Response.json({success:true,totalRequested:ips.length,foundCount:rows.length,results});
 }catch(error){return apiError(error);}
},'read');
