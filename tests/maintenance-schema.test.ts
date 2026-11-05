import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
it('migrates maintenance independently with immutable plans, revision trigger and protected audit',()=>{
 const sql=readFileSync(new URL('../migrations/003_maintenance.sql',import.meta.url),'utf8');
 for(const name of ['ip_intel_maintenance_plans','ip_intel_maintenance_jobs','ip_intel_retention_policies','ip_intel_maintenance_audit'])expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${name}`);
 expect(sql).toContain('BEFORE UPDATE ON public.ip_intel_reputation');
 expect(sql).toContain('UNIQUE (actor_id,idempotency_key)');
 expect(sql).toContain('REVOKE ALL');
 expect(sql).toContain('ip_intel_maintenance');
 expect(sql).toContain('TO ip_intel_read;');
 expect(sql).toContain("VALUES ('003')");
 expect(sql).toContain('max(revision)');
 expect(sql).toContain('GRANT USAGE ON SEQUENCE public.ip_intel_reputation_revision_seq TO ip_intel_reputation;');
 expect(sql).not.toMatch(/GRANT[^;]*DELETE[^;]*(events|cache|users|audit)/i);
 expect(sql).not.toMatch(/ON DELETE CASCADE|DROP TABLE/i);
});
