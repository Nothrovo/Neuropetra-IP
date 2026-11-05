import {createHash} from 'node:crypto';
import {getAuthPool} from './db-pool';
import {AuthError} from './auth';
export async function requireFeedToken(request:Request):Promise<{id:string}> {
 const match=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('authorization')??'');
 if(!match)throw new AuthError(401,'Unauthorized');
 const hash=createHash('sha256').update(match[1]).digest('hex');
 const result=await getAuthPool().query<{id:string;scopes:string[]}>(`SELECT id,scopes FROM app_feed_tokens WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > now()`,[hash]);
 const token=result.rows[0];if(!token)throw new AuthError(401,'Unauthorized');if(!token.scopes.includes('feed:read'))throw new AuthError(403,'Forbidden');return {id:token.id};
}
