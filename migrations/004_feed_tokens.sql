-- Machine feed tokens are operator-created, scoped, hashed, expiring and revocable.
CREATE TABLE IF NOT EXISTS app_feed_tokens (
 id uuid PRIMARY KEY,
 token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
 scopes text[] NOT NULL DEFAULT ARRAY['feed:read']::text[] CHECK (scopes <@ ARRAY['feed:read']::text[]),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON app_feed_tokens FROM PUBLIC;
GRANT SELECT ON app_feed_tokens TO ip_intel_auth;
INSERT INTO ip_intel_schema_migrations(version) VALUES ('004') ON CONFLICT DO NOTHING;
