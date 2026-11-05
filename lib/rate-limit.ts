/** Single-process limiter. Use a shared store before deploying multiple replicas. */
interface RecordValue {tokens:number;lastRefill:number;expiresAt:number}
export function createRateLimiter({maxKeys=10000,ttlMs=3600000}:{maxKeys?:number;ttlMs?:number}={}) {
 const store=new Map<string,RecordValue>();
 return {
  check(identifier:string,capacity=60,fillPerSecond=1):{allowed:boolean;remaining:number} {
   const now=Date.now();
   for(const [key,value] of store)if(value.expiresAt<=now)store.delete(key);
   if(!Number.isFinite(capacity)||capacity<1||!Number.isFinite(fillPerSecond)||fillPerSecond<0||identifier.length>512)return {allowed:false,remaining:0};
   const prior=store.get(identifier);
   if(!prior&&store.size>=maxKeys)return {allowed:false,remaining:0};
   const record=prior??{tokens:capacity,lastRefill:now,expiresAt:now+ttlMs};
   record.tokens=Math.min(capacity,record.tokens+Math.max(0,now-record.lastRefill)/1000*fillPerSecond);record.lastRefill=now;record.expiresAt=now+ttlMs;
   const allowed=record.tokens>=1;if(allowed)record.tokens-=1;
   store.set(identifier,record);return {allowed,remaining:Math.floor(record.tokens)};
  },
  size(){return store.size;}
 };
}
const limiter=createRateLimiter();
/** Call with verified actor/route identity, never client forwarded headers. */
export const checkRateLimit=limiter.check;
