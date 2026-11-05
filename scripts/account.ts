#!/usr/bin/env -S npx tsx
import { openSync, writeFileSync, closeSync, readFileSync, statSync } from 'node:fs';
import { createBootstrapToken } from '../lib/bootstrap';
import { hashPassword, validateUsername } from '../lib/auth';
import { closePools, getAuthPool } from '../lib/db-pool';
const args=process.argv.slice(2);
function option(name:string):string{const index=args.indexOf(name);if(index<0||!args[index+1]||args[index+1].startsWith('--'))throw new Error('Missing option');return args[index+1];}
async function main(){
 if(args[0]==='bootstrap'){
  const output=option('--out');const fd=openSync(output,'wx',0o600);
  try{writeFileSync(fd,await createBootstrapToken(),'utf8');}finally{closeSync(fd);}
  console.log('Bootstrap token written to the protected local file; expires in 30 minutes. Do not place it in URLs or logs.');
 }else if(args[0]==='reset-password'){
  const username=option('--username');validateUsername(username);
  const passwordFile=option('--password-file');
  if(statSync(passwordFile).mode&0o077)throw new Error('Password file must be private');
  // Passwords are preserved exactly; create the file without a newline.
  const passwordHash=await hashPassword(readFileSync(passwordFile,'utf8'));
  const client=await getAuthPool().connect();
  try{
   await client.query('BEGIN');
   const result=await client.query<{id:string}>('UPDATE ip_intel_users SET password_hash=$1 WHERE username=$2 RETURNING id',[passwordHash,username]);
   if(result.rowCount!==1)throw new Error('Account not found');
   await client.query('UPDATE ip_intel_sessions SET revoked_at=now() WHERE user_id=$1',[result.rows[0].id]);
   await client.query('COMMIT');console.log('Password reset; all account sessions revoked. Setup remains closed.');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }else throw new Error('Unknown account command');
}
main().catch(()=>{console.error('Account operation failed; verify command, private files, installation state and configured auth database.');process.exitCode=1;}).finally(closePools);
