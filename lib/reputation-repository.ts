import { getReputationPool } from './db-pool';
import { normalizeIp } from './ip-validator';
export interface ReputationWrite { ip:string; abuseScore:number; countryCode?:string|null; isp?:string|null; reputationJson?:Record<string,unknown>|null; geoJson?:Record<string,unknown>|null; checkedAt?:string }
export interface ReputationRow {ip:string;abuse_score:number;country_code:string|null;isp:string|null;geo_json:Record<string,unknown>|null;reputation_json:Record<string,unknown>|null;reputation_checked_at:string}
const mockReputation = new Map<string,ReputationRow>();
export function getMockReputation(ip:string):ReputationRow|null { return mockReputation.get(ip)??null; }
export function getMockReputations():ReputationRow[] { return [...mockReputation.values()]; }
export async function saveReputation(input:ReputationWrite):Promise<void> {
 const ip=normalizeIp(input.ip);
 if(!Number.isInteger(input.abuseScore)||input.abuseScore<0||input.abuseScore>100)throw new Error('Invalid provider score');
 const checkedAt=input.checkedAt??new Date().toISOString();
 if(!Number.isFinite(Date.parse(checkedAt)))throw new Error('Invalid check time');
 if(process.env.USE_MOCK_DATA==='true') {mockReputation.set(ip,{ip,abuse_score:input.abuseScore,country_code:input.countryCode??null,isp:input.isp??null,geo_json:input.geoJson??null,reputation_json:input.reputationJson??null,reputation_checked_at:checkedAt});return;}
 await getReputationPool().query(`INSERT INTO ip_intel_reputation (ip,abuse_score,country_code,isp,geo_json,reputation_json,reputation_checked_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (ip) DO UPDATE SET abuse_score=EXCLUDED.abuse_score,country_code=EXCLUDED.country_code,isp=EXCLUDED.isp,geo_json=EXCLUDED.geo_json,reputation_json=EXCLUDED.reputation_json,reputation_checked_at=EXCLUDED.reputation_checked_at,revision=ip_intel_reputation.revision+1`,[ip,input.abuseScore,input.countryCode??null,input.isp??null,input.geoJson??null,input.reputationJson??null,checkedAt]);
}
