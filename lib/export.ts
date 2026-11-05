import { normalizeIp, isValidIPv4 } from './ip-validator';
import { ApiInputError } from './api-input';
export function encodeCsvCell(value:unknown):string {
 let cell=value==null?'':String(value);
 if(/^[\s\x00-\x1f]*[=+@-]/.test(cell)||/^[\t\r\n]/.test(cell))cell="'"+cell;
 return '"'+cell.replace(/"/g,'""')+'"';
}
export function encodeMarkdownCell(value:unknown):string {return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\|/g,'\\|').replace(/[\r\n]+/g,' ');}
export type FeedFormat='txt'|'csv'|'cdb';
export interface FeedRow {ip:string;abuse_score:number|null;total_alert_count:number;country_code:string|null;attack_types:string[];vt_malicious?:number|null}
export function feedFormat(input:string|null):FeedFormat {if(input===null)return 'txt';if(input==='txt'||input==='csv'||input==='cdb')return input;throw new ApiInputError('Supported formats: txt, csv, cdb');}
export function serializeFeed(rows:FeedRow[],format:FeedFormat):string {
 const ips=rows.map(r=>{try{if(r.ip!==r.ip.trim()||/[\r\n\0]/.test(r.ip))throw new Error();return normalizeIp(r.ip);}catch{throw new ApiInputError('Invalid feed indicator');}});
 if(format==='cdb') {
  if(ips.some(ip=>!isValidIPv4(ip)))throw new ApiInputError('CDB export supports IPv4 only; choose txt or csv for IPv6',422);
  return rows.map((r,i)=>`${ips[i]}:Score_${r.abuse_score??'unknown'}|Alerts_${r.total_alert_count}|${(r.attack_types[0]??'unspecified').replace(/[^a-zA-Z0-9_-]/g,'_')}`).join('\n');
 }
 if(format==='csv')return ['ip,abuse_score,vt_malicious,total_alerts,country,primary_attack',...rows.map((r,i)=>[ips[i],r.abuse_score,r.vt_malicious,r.total_alert_count,r.country_code,r.attack_types[0]??'unspecified'].map(encodeCsvCell).join(','))].join('\r\n');
 return ips.join('\n');
}
