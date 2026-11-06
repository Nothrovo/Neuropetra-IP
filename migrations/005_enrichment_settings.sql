ALTER TABLE ip_intel_installation
  ADD COLUMN IF NOT EXISTS abuseipdb_api_key text,
  ADD COLUMN IF NOT EXISTS external_enrichment_enabled boolean;

INSERT INTO ip_intel_schema_migrations(version) VALUES ('005') ON CONFLICT DO NOTHING;
