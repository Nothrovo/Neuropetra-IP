#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
const args=process.argv.slice(2);
function option(name,fallback){const i=args.indexOf(name);if(i<0)return fallback;if(!args[i+1]||args[i+1].startsWith('--'))throw new Error('Missing option value');return args[i+1];}
try {
 const directory=resolve(option('--directory','.runtime/secrets'));
 const host=option('--host','postgres'); const port=option('--port','5432'); const database=option('--database','ip_intel');
 if(!/^[a-zA-Z0-9_.-]+$/.test(host) || !/^\d{1,5}$/.test(port) || !/^[a-zA-Z0-9_]+$/.test(database))throw new Error('Invalid database host, port or name');
 const names=['postgres-password','role-passwords.json','migration-database-url','auth-database-url','read-database-url','reputation-database-url','maintenance-database-url','compose.env'];
 if(names.some(name=>existsSync(join(directory,name))))throw new Error('Refusing to overwrite existing installation secrets');
 mkdirSync(directory,{recursive:true,mode:0o700});chmodSync(directory,0o700);
 const random=()=>randomBytes(32).toString('hex');
 const passwords={migration:random(),auth:random(),read:random(),reputation:random(),maintenance:random()};
 const put=(name,value)=>writeFileSync(join(directory,name),value+'\n',{mode:0o600,flag:'wx'});
 put('postgres-password',random());put('role-passwords.json',JSON.stringify(passwords));
 for(const [scope,password] of Object.entries(passwords))put(`${scope}-database-url`,`postgresql://ip_intel_${scope}_login:${password}@${host}:${port}/${database}`);
 put('compose.env',`IP_INTEL_SECRET_DIR=${directory}\nLOCAL_UID=${process.getuid?.() ?? 1000}\nLOCAL_GID=${process.getgid?.() ?? 1000}`);
 console.log('Installation secrets created with restricted permissions. No secret values are printed.');
 console.log(`Compose requires --env-file ${join(directory,'compose.env')}. Configure APP_ORIGIN separately.`);
}catch {console.error('Installation failed: invalid options or existing/unwritable secret files. Nothing was overwritten.');process.exitCode=1;}
