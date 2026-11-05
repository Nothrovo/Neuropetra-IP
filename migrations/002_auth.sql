CREATE TABLE IF NOT EXISTS ip_intel_installation (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton), installed_at timestamptz,
 bootstrap_hash text, bootstrap_expires_at timestamptz,
 CHECK ((bootstrap_hash IS NULL) = (bootstrap_expires_at IS NULL))
);
INSERT INTO ip_intel_installation(singleton) VALUES (true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS ip_intel_users (
 id uuid PRIMARY KEY, username text UNIQUE NOT NULL CHECK (length(username) BETWEEN 3 AND 64),
 password_hash text NOT NULL, role text NOT NULL CHECK(role IN ('analyst','admin')),
 disabled boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ip_intel_sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES ip_intel_users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, revoked_at timestamptz, recent_auth_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ip_intel_sessions_user_idx ON ip_intel_sessions(user_id);
CREATE TABLE IF NOT EXISTS ip_intel_auth_attempts (
 bucket text PRIMARY KEY, window_start timestamptz NOT NULL, attempts integer NOT NULL
);
REVOKE ALL ON ip_intel_users,ip_intel_sessions,ip_intel_installation,ip_intel_auth_attempts FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON ip_intel_users,ip_intel_sessions,ip_intel_auth_attempts TO ip_intel_auth;
GRANT SELECT,UPDATE ON ip_intel_installation TO ip_intel_auth;
INSERT INTO ip_intel_schema_migrations(version) VALUES ('002') ON CONFLICT DO NOTHING;
