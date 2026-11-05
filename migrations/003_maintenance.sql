-- Owned maintenance only. No shared telemetry or account mutation.
-- Operator provisions optional NOLOGIN group role ip_intel_maintenance and grants
-- membership to a dedicated LOGIN. No passwords or runtime role creation here.
CREATE SEQUENCE IF NOT EXISTS public.ip_intel_reputation_revision_seq AS bigint;
SELECT setval('public.ip_intel_reputation_revision_seq',GREATEST((SELECT last_value FROM public.ip_intel_reputation_revision_seq),(SELECT COALESCE(max(revision),1) FROM public.ip_intel_reputation)),true);
CREATE OR REPLACE FUNCTION public.ip_intel_reputation_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  NEW.revision := nextval('public.ip_intel_reputation_revision_seq');
  RETURN NEW;
END $$;
-- A global monotonic revision prevents delete/reinsert ABA, including enrichment writes.
CREATE OR REPLACE TRIGGER ip_intel_reputation_revision_insert
BEFORE INSERT ON public.ip_intel_reputation
FOR EACH ROW EXECUTE FUNCTION public.ip_intel_reputation_revision();
CREATE OR REPLACE TRIGGER ip_intel_reputation_revision_update
BEFORE UPDATE ON public.ip_intel_reputation
FOR EACH ROW EXECUTE FUNCTION public.ip_intel_reputation_revision();

CREATE TABLE IF NOT EXISTS public.ip_intel_maintenance_plans (
 id uuid PRIMARY KEY,
 actor_id text NOT NULL,
 plan_json jsonb NOT NULL,
 expires_at timestamptz NOT NULL,
 state text NOT NULL CHECK (state IN ('previewed','queued','completed','cancelled','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (jsonb_array_length(plan_json->'targets') <= 200)
);
CREATE OR REPLACE FUNCTION public.ip_intel_maintenance_immutable_plan() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.actor_id IS DISTINCT FROM OLD.actor_id
 OR NEW.plan_json IS DISTINCT FROM OLD.plan_json OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
 OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
  RAISE EXCEPTION 'immutable maintenance plan';
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER ip_intel_maintenance_immutable_plan
BEFORE UPDATE ON public.ip_intel_maintenance_plans
FOR EACH ROW EXECUTE FUNCTION public.ip_intel_maintenance_immutable_plan();
CREATE TABLE IF NOT EXISTS public.ip_intel_maintenance_jobs (
 id uuid PRIMARY KEY,
 plan_id uuid NOT NULL UNIQUE REFERENCES public.ip_intel_maintenance_plans(id),
 actor_id text NOT NULL,
 idempotency_key uuid NOT NULL,
 job_json jsonb NOT NULL,
 status text NOT NULL CHECK (status IN ('queued','completed','cancelled','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (actor_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS public.ip_intel_retention_policies (
 id uuid PRIMARY KEY,
 actor_id text NOT NULL,
 cutoff timestamptz NOT NULL,
 enabled boolean NOT NULL DEFAULT false,
 job_id uuid UNIQUE REFERENCES public.ip_intel_maintenance_jobs(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.ip_intel_maintenance_audit (
 id uuid PRIMARY KEY,
 actor_id text NOT NULL,
 action text NOT NULL,
 scope_fingerprint text NOT NULL,
 matched_count integer NOT NULL CHECK (matched_count BETWEEN 0 AND 200),
 affected_count integer NOT NULL CHECK (affected_count BETWEEN 0 AND 200),
 outcome text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.ip_intel_maintenance_plans,public.ip_intel_maintenance_jobs,
 public.ip_intel_retention_policies,public.ip_intel_maintenance_audit FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.ip_intel_reputation_revision_seq FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ip_intel_maintenance') THEN
  GRANT USAGE ON SCHEMA public TO ip_intel_maintenance;
  GRANT SELECT(ip,revision,reputation_checked_at) ON public.ip_intel_reputation TO ip_intel_maintenance;
  GRANT UPDATE(reputation_checked_at) ON public.ip_intel_reputation TO ip_intel_maintenance;
  GRANT DELETE ON public.ip_intel_reputation TO ip_intel_maintenance;
  GRANT USAGE ON SEQUENCE public.ip_intel_reputation_revision_seq TO ip_intel_maintenance;
  GRANT SELECT,INSERT ON public.ip_intel_maintenance_plans,public.ip_intel_maintenance_jobs,public.ip_intel_retention_policies TO ip_intel_maintenance;
  GRANT UPDATE(state) ON public.ip_intel_maintenance_plans TO ip_intel_maintenance;
  GRANT UPDATE(status,job_json) ON public.ip_intel_maintenance_jobs TO ip_intel_maintenance;
  GRANT UPDATE(enabled) ON public.ip_intel_retention_policies TO ip_intel_maintenance;
  GRANT SELECT,INSERT ON public.ip_intel_maintenance_audit TO ip_intel_maintenance;
 END IF;
 -- Reader and writer role names are the installation's group roles.
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ip_intel_read') THEN
  GRANT SELECT ON public.ip_intel_maintenance_jobs,public.ip_intel_retention_policies,public.ip_intel_maintenance_audit TO ip_intel_read;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ip_intel_reputation') THEN
  GRANT USAGE ON SEQUENCE public.ip_intel_reputation_revision_seq TO ip_intel_reputation;
 END IF;
END $$;
INSERT INTO public.ip_intel_schema_migrations(version) VALUES ('003') ON CONFLICT DO NOTHING;
