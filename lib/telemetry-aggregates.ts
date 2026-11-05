import { MOCK_IP_EVENTS, type IpIntelEventRow } from './mock-data';
import { query } from './db';
import { isCriticalOutcome } from './scoring';
export interface TelemetryScope { from: string; to: string; alertType?: string; outcome?: string; targetHost?: string }
export interface IpSummary {
 eventCount: number; outcomes: {outcome:string;count:number}[]; timeline:{date:string;count:number}[];
 hasCriticalOutcome:boolean; distinctTargetsCount:number; lastSeen:string|null; latestEvent:IpIntelEventRow|null;
}
export function filterEvents(events: IpIntelEventRow[], scope: TelemetryScope): IpIntelEventRow[] {
 return events.filter(e=>new Date(e.seen_at).getTime()>=Date.parse(scope.from)&&new Date(e.seen_at).getTime()<Date.parse(scope.to)&&(!scope.alertType||e.alert_type===scope.alertType)&&(!scope.outcome||(e.outcome??'unspecified')===scope.outcome)&&(!scope.targetHost||e.target_host===scope.targetHost));
}
export function eventPredicate(ip: string|null, scope: TelemetryScope): {where:string;params:unknown[]} {
 const params:unknown[]=[scope.from,scope.to]; const clauses=['seen_at >= $1::timestamptz','seen_at < $2::timestamptz'];
 if(ip!==null){params.push(ip);clauses.push(`ip = $${params.length}`);}
 for(const [col,value] of [['alert_type',scope.alertType],["COALESCE(outcome, 'unspecified')",scope.outcome],['target_host',scope.targetHost]]) if(value){params.push(value);clauses.push(`${col} = $${params.length}`);}
 return {where:clauses.join(' AND '),params};
}
export async function getIpSummary(ip:string,scope:TelemetryScope):Promise<IpSummary> {
 if(process.env.USE_MOCK_DATA==='true') {
  const events=filterEvents(MOCK_IP_EVENTS.filter(e=>e.ip===ip),scope).sort((a,b)=>Date.parse(b.seen_at)-Date.parse(a.seen_at)||b.id-a.id);
  const outcomes=new Map<string,number>(),timeline=new Map<string,number>();
  for(const e of events){const o=e.outcome??'unspecified',d=new Date(e.seen_at).toISOString().slice(0,10);outcomes.set(o,(outcomes.get(o)??0)+1);timeline.set(d,(timeline.get(d)??0)+1);}
  return {eventCount:events.length,outcomes:[...outcomes].map(([outcome,count])=>({outcome,count})).sort((a,b)=>a.outcome.localeCompare(b.outcome)),timeline:[...timeline].sort().map(([date,count])=>({date,count})),hasCriticalOutcome:events.some(e=>isCriticalOutcome(e.outcome)),distinctTargetsCount:new Set(events.map(e=>e.target_host).filter(Boolean)).size,lastSeen:events[0]?.seen_at??null,latestEvent:events[0]??null};
 }
 const {where,params}=eventPredicate(ip,scope);
 const [counts,outcomes,timeline,latest]=await Promise.all([
  query<{count:string;targets:string;critical:boolean;last_seen:string|null}>(`SELECT COUNT(*) AS count,COUNT(DISTINCT target_host) AS targets, COALESCE(BOOL_OR(LOWER(TRIM(outcome)) IN ('success','compromised','allowed','pwned','bypassed')),false) AS critical,MAX(seen_at) AS last_seen FROM ip_intel_events WHERE ${where}`,params),
  query<{outcome:string;count:string}>(`SELECT COALESCE(outcome,'unspecified') AS outcome,COUNT(*) AS count FROM ip_intel_events WHERE ${where} GROUP BY COALESCE(outcome,'unspecified') ORDER BY outcome`,params),
  query<{date:string;count:string}>(`SELECT TO_CHAR(seen_at AT TIME ZONE 'UTC','YYYY-MM-DD') AS date,COUNT(*) AS count FROM ip_intel_events WHERE ${where} GROUP BY date ORDER BY date`,params),
  query<IpIntelEventRow>(`SELECT * FROM ip_intel_events WHERE ${where} ORDER BY seen_at DESC,id DESC LIMIT 1`,params)
 ]);
 return {eventCount:Number(counts[0]?.count??0),distinctTargetsCount:Number(counts[0]?.targets??0),hasCriticalOutcome:counts[0]?.critical??false,lastSeen:counts[0]?.last_seen??null,latestEvent:latest[0]??null,outcomes:outcomes.map(o=>({...o,count:Number(o.count)})),timeline:timeline.map(t=>({...t,count:Number(t.count)}))};
}
