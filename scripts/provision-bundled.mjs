import { readFileSync } from 'node:fs';
try {
 const password=readFileSync(process.env.POSTGRES_PASSWORD_FILE,'utf8').trim();
 process.env.PROVISION_DATABASE_URL=`postgresql://postgres:${encodeURIComponent(password)}@postgres:5432/ip_intel`;
 await import('./db-bootstrap.mjs');
}catch{console.error('Bundled provisioning could not read protected local secrets.');process.exitCode=1;}
