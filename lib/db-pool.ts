import { Pool } from 'pg';
import { databaseUrl, type DatabaseScope } from './config';
const pools = new Map<DatabaseScope, Pool>();
function getPool(scope: DatabaseScope): Pool {
 let pool = pools.get(scope);
 if (!pool) {
  pool = new Pool({connectionString: databaseUrl(scope), max: 10, connectionTimeoutMillis: 5000,
   idleTimeoutMillis: 30000, statement_timeout: 15000, options: '-c search_path=public'});
  // Never log pg errors: they can contain hostnames, queries or credentials.
  pool.on('error', () => { console.error('Database connection unavailable'); });
  pools.set(scope, pool);
 }
 return pool;
}
export const getAuthPool = () => getPool('auth');
export const getReadPool = () => getPool('read');
export const getReputationPool = () => getPool('reputation');
export const getMaintenancePool = () => getPool('maintenance');
export async function closePools(): Promise<void> {
 const current = [...pools.values()]; pools.clear(); await Promise.all(current.map(pool=>pool.end()));
}
