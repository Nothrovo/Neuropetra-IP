# Database schema and privilege contract

The source of truth is the versioned SQL in [`migrations/`](../migrations/), not a discovered operational database. This document describes the **fresh owned schema**, with no production row counts, observed provider distributions or performance claims. Use a dedicated application database (bundled name: `ip_intel`) on PostgreSQL 16. Installation procedures are in [OPERATIONS.md](OPERATIONS.md).

## Explicit schema lifecycle

`pnpm db:provision` creates fixed scoped login identities using generated protected role passwords, transfers ownership of `public` to `ip_intel_migration_login`, revokes public schema creation and grants database connectivity. It is a privileged **fresh-install operator** action, not a runtime action or password-rotation tool. Existing application login names cause refusal. These names are cluster-wide: do not assume multiple dedicated databases can independently reprovision the same names on one cluster.

`pnpm db:migrate` uses only `MIGRATION_DATABASE_URL` or its `_FILE` variant. It takes an advisory lock, sorts `NNN_name.sql`, records SHA-256 checksums and applies each new file in its own transaction. It rejects changed applied SQL. Never mount this connection into the web app.

Two distinct version tables exist:

- `ip_intel_migration_history(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`: authoritative script-level application/checksum history, maintained by the migration runner.
- `ip_intel_schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`: migration feature markers read by the app. These markers alone do not prove a full schema or grant audit. Readiness requires `001`, `002` and `004`, plus `003` when maintenance access is configured, and runs zero-row column/access probes for the consumed authentication/feed/telemetry/reputation relations and optional maintenance metadata. It does not prove write privileges, checksum validity or a tested recovery checkpoint.

### Migration inventory

| File | Purpose |
| --- | --- |
| `001_initial.sql` | Telemetry compatibility validation, cache/events, owned reputation, group roles, baseline read/write grants. |
| `002_auth.sql` | Durable installation marker, users, sessions, auth-attempt buckets and auth grants. |
| `003_maintenance.sql` | Global reputation revision sequence/triggers, immutable maintenance plans, jobs, one-run retention policies, append-oriented audit and scoped grants. |
| `004_feed_tokens.sql` | Hashed, scoped, expiring/revocable machine feed credentials. |

The initial migration requires cache/events to be both present or both absent, validates all consumed column types (including text array element types) and refuses incompatible schemas. It does not automatically convert existing telemetry or validate every possible legacy constraint. Do not use this as a license to run it on a shared SOC database. Map/copy externally sourced data through an explicitly reviewed integration into the dedicated schema.

## Connection and role split

Login identities use independent generated passwords. Group roles are `NOLOGIN`; the migration identity owns application objects and is not a web credential. Runtime groups receive `USAGE` on `public`, not general schema creation.

| Login identity | Runtime group | Purpose and grants |
| --- | --- | --- |
| `ip_intel_migration_login` | None | Owns migrated objects/schema; explicit migration job only. |
| `ip_intel_auth_login` | `ip_intel_auth` | SELECT/INSERT/UPDATE/DELETE on users, sessions and auth attempts; SELECT/UPDATE on installation state; SELECT only on feed tokens. |
| `ip_intel_read_login` | `ip_intel_read` | SELECT on cache, events, reputation and schema markers; SELECT on jobs, retention policies and audit. No telemetry mutations. |
| `ip_intel_reputation_login` | `ip_intel_reputation` | SELECT/INSERT/UPDATE on owned reputation and revision sequence USAGE. No telemetry/account mutations or reputation DELETE. |
| `ip_intel_maintenance_login` | `ip_intel_maintenance` | Optional: SELECT `(ip,revision,reputation_checked_at)`, UPDATE `(reputation_checked_at)`, DELETE on owned reputation, revision sequence USAGE; restricted plans/jobs/policies updates and SELECT/INSERT audit. No account or telemetry mutations. |

Maintenance metadata grants: SELECT/INSERT on plans/jobs/policies; UPDATE only plan `state`, job `status,job_json` and policy `enabled`; SELECT/INSERT on audit with no UPDATE/DELETE. The runtime still performs application-level authorization and allowlisted scope validation: database credentials are not a user identity. The worker uses auth access separately to recheck the durable administrator; the maintenance identity cannot query accounts.

There is no generic `DATABASE_URL` or PostgreSQL localhost fallback. Each runtime connection is configured explicitly via `AUTH_DATABASE_URL`, `READ_DATABASE_URL`, `REPUTATION_DATABASE_URL` and optionally `MAINTENANCE_DATABASE_URL`, or its `_FILE` counterpart. Configure only one source per secret. No runtime scope receives the provisioning/migration credential.

## Telemetry resources (read-only to application runtime)

### `ip_intel_cache`

| Columns | Type / fresh-schema contract |
| --- | --- |
| `ip` | `text PRIMARY KEY` |
| `first_seen`, `last_seen` | `timestamptz NOT NULL`; **no default**—ingestion must supply observations. |
| `last_alert_id`, `reputation_source`, `country_code`, `isp`, `notes` | Nullable `text` |
| `abuse_score`, `vt_malicious` | Nullable `integer` (legacy/source-supplied fields). |
| `geo_json`, `reputation_json` | Nullable `jsonb` |
| `attack_types`, `mitre_tactics`, `target_hosts`, `endpoints_targeted`, `http_methods_used` | `text[] NOT NULL DEFAULT '{}'` |
| `total_alert_count` | `integer NOT NULL DEFAULT 0` |
| `reputation_checked_at` | Nullable `timestamptz` |

`mitre_tactics` is a historical column name that can hold ATT&CK technique/sub-technique IDs; rendering maps known IDs to tactics. A source-provided `vt_malicious` field is not evidence of a live VirusTotal integration. The product does not ship an automatically configured SOC collector, schema rewrite or account with telemetry ingestion permissions.

### `ip_intel_events`

| Columns | Type / fresh-schema contract |
| --- | --- |
| `id` | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` |
| `ip` | `text NOT NULL REFERENCES ip_intel_cache(ip) ON DELETE RESTRICT` |
| `seen_at` | `timestamptz NOT NULL`; ingestion must supply it. |
| `alert_type`, `attack_subtype`, `target_host`, `endpoint`, `outcome`, `raw_summary` | Nullable `text` |
| `mitre` | `text[] NOT NULL DEFAULT '{}'` |

Events require a parent cache record. Deleting a cache row does **not** cascade away evidence in the fresh schema. The app maintenance feature never deletes cache/events. Nullable/unknown outcomes are not proof of successful compromise or successful defense. Event pages order by timestamp and unique ID to avoid ambiguity on timestamp ties. Scoped evidence/aggregate filters use half-open UTC time windows (`from <= seen_at < to`).

## Owned reputation

`ip_intel_reputation` is separate from the telemetry parent and intentionally has **no FK dependency on cache**. Reputation-only indicators can exist with no local first/last-seen timestamps or alert count.

| Columns | Contract |
| --- | --- |
| `ip` | `text PRIMARY KEY` |
| `abuse_score` | Nullable `integer CHECK (abuse_score BETWEEN 0 AND 100)` |
| `country_code`, `isp` | Nullable `text` |
| `geo_json`, `reputation_json` | Nullable `jsonb` |
| `reputation_checked_at` | Nullable `timestamptz`; invalidation clears this field. |
| `revision` | `bigint NOT NULL DEFAULT 1`, replaced on INSERT/UPDATE by the global sequence trigger after migration 003. |

Enrichment updates only this owned resource, not cache timestamps/counts or events. Reads merge owned reputation with available telemetry. The global monotonic `ip_intel_reputation_revision_seq` detects changed snapshots and delete/reinsert ABA; do not disable its triggers or reset it while old plans exist. Neither a missing reputation record nor a null provider score is a clean bill of health.

Maintenance requires operator attestation of exclusive ownership and checks for **any inbound FK** to reputation. Even an inbound non-cascading dependency disables maintenance. New schema dependencies must be reviewed before enabling it.

## Authentication and setup

| Table | Contract |
| --- | --- |
| `ip_intel_installation` | Singleton boolean PK constrained true; nullable `installed_at`, `bootstrap_hash`, `bootstrap_expires_at`; hash and expiry must be present/absent together. Initial singleton row is seeded without a user or password. |
| `ip_intel_users` | UUID PK, unique non-null username, non-null scrypt password hash, role constrained to `analyst`/`admin`, disabled flag default false, creation timestamp. |
| `ip_intel_sessions` | SHA-256 `token_hash` text PK, UUID user FK with `ON DELETE CASCADE`, non-null expiry/recent-auth/creation timestamps, nullable revocation timestamp. User lookup index is created. |
| `ip_intel_auth_attempts` | Bucket text PK, non-null window-start timestamp and integer attempts. Persists authentication throttling state. |

The setup token is a 32-byte random opaque value delivered only through a newly created protected host file, hashed in PostgreSQL and valid for 30 minutes. Completing setup atomically locks the singleton, verifies unused authorization, creates the owner-selected administrator and clears bootstrap fields. Installed state is durable even if users are later removed; database failure is not treated as permission to reopen setup. Sessions are opaque server-side credentials, not trusted role-bearing JSON cookies. Password reset revokes all sessions for the account.

## Machine feed tokens

`app_feed_tokens`: UUID PK; unique `token_hash` constrained to 64 lowercase hex characters; `scopes text[]` constrained to a subset of `['feed:read']` with that default; non-null `expires_at`; nullable `revoked_at`; creation timestamp. Authentication hashes an exact 43-character base64url bearer token and checks expiry, revocation and the required scope. Empty scopes grant nothing.

Only SELECT is granted to the auth group. Issuance/rotation/revocation is a reviewed operator database integration, **not** a shipped token-management UI or account CLI. Never persist the raw bearer secret here or expose it in a query string.

## Maintenance records

| Table | Key fields and invariants |
| --- | --- |
| `ip_intel_maintenance_plans` | UUID PK, actor text, immutable JSON snapshot, expiry, bounded state, creation time. Targets limited to 200; trigger blocks edits to identity/snapshot/expiry. |
| `ip_intel_maintenance_jobs` | UUID PK, unique plan FK, actor, UUID idempotency key, result JSON/status. `(actor_id,idempotency_key)` is unique. |
| `ip_intel_retention_policies` | UUID PK, actor, UTC cutoff, enabled flag default false, unique optional job FK, creation time. Records an approved **one-run** job, not recurring cleanup. |
| `ip_intel_maintenance_audit` | UUID PK, actor/action/fingerprint, matched and affected counts each constrained to 0–200, outcome and timestamp. Runtime maintenance has no edit/delete grant. |

Plans expire after ten minutes. Execution rechecks ownership, inbound dependencies, actor and exact current target revisions under locks, with fixed statements/timeouts and an all-or-nothing transaction. Bulk delete (more than one row) additionally requires operator recovery checkpoint assertions. These assertions do not create or independently verify a backup. Queued retention requires explicit worker invocation before expiry; no future matching rows join the snapshot and no scheduler ships by default.

## Indexes and performance

The migrations create primary-key/unique indexes, the session user index, and maintenance idempotency/plan uniqueness. They do **not** promise automatic telemetry tuning or the indexes from an external deployment. No measured query latencies are claimed here.

After measuring a representative **synthetic** workload, a DBA may consider a composite event index `(ip, seen_at DESC, id DESC)` and indexes matching the actual aggregate/roster predicates. Assess write/storage cost and real query plans before applying. `CREATE INDEX CONCURRENTLY` cannot run inside the current transactional migration loop; use a reviewed separate operator procedure or a deliberately designed migration approach. Never create indexes through the read-only web connection or test on an operational database without separate authorization.
