# Neuropetra IP

A standalone IP investigation application built with Next.js, TypeScript and PostgreSQL. Investigate exact IPv4/IPv6 indicators, browse local evidence and provider/ISP rosters, compare reputation with local signals, and export bounded feeds.

## What is implemented

- Authenticated local investigation, bulk input, event history, dashboard aggregates and MITRE technique mapping.
- Separate application-owned reputation storage: enrichment does not manufacture local observations or overwrite telemetry timestamps/counts.
- Optional **AbuseIPDB** enrichment, disabled by default. Administrators can configure, test, and toggle API keys directly in the Web UI (`/settings/enrichment`) without backend or container restarts. Legacy VirusTotal fields can be displayed/scored when supplied by an integration; there is no live VirusTotal client.
- Persisted users, salted scrypt password hashes, opaque server-side sessions, role checks, revocation and recent reauthentication for maintenance execution.
- TXT/CSV feeds and IPv4-only Wazuh CDB output. CSV cells are escaped against spreadsheet formula injection; no export format is a substitute for reviewing a blocklist.
- Optional, narrowly scoped reputation invalidation/deletion with preview, confirmation, immutable snapshots and audit records. Retention is an explicitly approved **one-run job**, not an automatic recurring scheduler.

A score of zero, missing reputation, and an **Unknown** verdict are not interchangeable. Scoring is a prioritization aid, not a guarantee that an address is safe or malicious. An empty installation contains no operational telemetry; importing an external source requires an explicitly reviewed integration.

## Installation

**PostgreSQL is required**, including when mock telemetry is enabled. There are two supported deployment arrangements:

1. **Bundled PostgreSQL with Docker Compose** — private database network and persistent volume.
2. **A dedicated application database on your existing PostgreSQL server** — separately provisioned application roles, never a shared SOC/incident database.

The root `docker-compose.yml` contains only the app. `compose.postgres.yml` adds the database and explicit provision/migration jobs; `compose.operator.yml` adds the bootstrap-token operator. Database provisioning and migrations never run automatically in the web process.

### Bundled quick start

Prerequisites: Node.js 22, pnpm matching `package.json`, Docker Engine and Docker Compose v2. Run from this checkout. Keep the loopback binding until HTTPS termination is configured.

```bash
pnpm install --frozen-lockfile
pnpm install:secrets
install -d -m 700 .runtime/owner
export APP_ORIGIN=http://127.0.0.1:3000

docker compose --env-file .runtime/secrets/compose.env \
  -f docker-compose.yml -f compose.postgres.yml -f compose.operator.yml \
  up -d postgres

docker compose --env-file .runtime/secrets/compose.env \
  -f docker-compose.yml -f compose.postgres.yml -f compose.operator.yml \
  run --rm --build provision

docker compose --env-file .runtime/secrets/compose.env \
  -f docker-compose.yml -f compose.postgres.yml -f compose.operator.yml \
  run --rm --build migrate

docker compose --env-file .runtime/secrets/compose.env \
  -f docker-compose.yml -f compose.postgres.yml -f compose.operator.yml \
  run --rm --build account

docker compose --env-file .runtime/secrets/compose.env \
  -f docker-compose.yml -f compose.postgres.yml -f compose.operator.yml \
  up -d --build app
```

The installer generates distinct restricted secret files and refuses to overwrite them. Provisioning is for a **fresh dedicated database**; it refuses existing application login roles instead of silently rotating passwords.

Open `http://127.0.0.1:3000/setup`. Read `.runtime/owner/bootstrap-token` privately on the host and enter it in the setup form with **your chosen owner username and password**. The token expires after 30 minutes, is single-use, and is stored hashed in PostgreSQL. Do not print it in terminal recordings, put it in a URL, or send it to application logs. Setup creates an administrator; it is not a public registration route. There are no demo accounts or fallback credentials. Remove the consumed local token file securely according to host policy, then log in at `/login`.

For existing PostgreSQL, password recovery, upgrades, backups and production TLS, follow [OPERATIONS.md](docs/OPERATIONS.md). For removal, use the [non-destructive uninstall and data-retention runbook](docs/OPERATIONS.md#uninstall-and-data-retention); database data and recovery credentials are retained by default. The schema and exact privilege split are documented in [DB_SCHEMA.md](docs/DB_SCHEMA.md).

## Architecture and access

```text
Browser -> trusted HTTPS proxy (production) -> Next.js UI / authorized API
                                            |-> auth scope: setup, users, sessions, feed-token checks
                                            |-> read scope: telemetry + merged owned reputation
                                            |-> reputation scope: optional AbuseIPDB writes
                                            `-> optional maintenance scope: approved reputation jobs

Route A: scoped connections -> private Compose PostgreSQL -> persistent pgdata
Route B: scoped connections -> dedicated database on separately managed PostgreSQL
Operator only: provision -> explicit checksummed migrations -> private bootstrap file
```

The two routes use the same schema and privilege split; Route B changes database hosting, not ownership boundaries. Source collection, backup/restore, HTTPS ingress and optional provider credentials remain operator integrations. Reputation-only indicators do not invent observation timestamps or local alerts.

The shipped **analyst** role has investigation/read permission only. The **administrator** can additionally enrich, export and manage the owned database scope; maintenance execution/cancellation requires recent reauthentication as well as the optional maintenance configuration. Setup creates the first administrator, not a default analyst. Additional account provisioning is a reviewed operator integration, not a shipped user-management UI. A machine feed token grants only its exact feed GET route, not an interactive administrator session.

## Configuration

[`.env.example`](.env.example) lists names, not production credentials. Secret values may use a direct variable **or** its `_FILE` variant, never both. Compose mounts protected files; copying container paths from `.env.example` into a host environment does not create those files.

| Setting | Meaning |
| --- | --- |
| `APP_ORIGIN` | Required canonical browser origin, no path/trailing slash. HTTPS required for public domains/IPs; plain HTTP permitted for loopback and private LAN addresses (RFC 1918 / RFC 4193). Do not derive it from request Host/forwarded headers. |
| `AUTH_DATABASE_URL[_FILE]` | Users, installation state, sessions and authentication throttling. |
| `READ_DATABASE_URL[_FILE]` | Telemetry/reputation reads and permitted maintenance metadata reads. |
| `REPUTATION_DATABASE_URL[_FILE]` | Owned reputation writer; no telemetry writes. |
| `MAINTENANCE_DATABASE_URL[_FILE]` | Optional privileged maintenance scope; absent by default. |
| `ENABLE_EXTERNAL_ENRICHMENT` | `false` by default. Requires `true`, a provider key, reputation writer and non-mock mode to enable. |
| `ABUSEIPDB_API_KEY[_FILE]` | Optional server-side provider credential; never commit it. |
| `USE_MOCK_DATA` | Synthetic telemetry for development/tests, **not** an authentication or PostgreSQL bypass. |
| `APP_PORT` | Compose host port, default `3000`; update `APP_ORIGIN` to match. |
| `APP_BIND_IP` | Compose host interface to bind, default `0.0.0.0` (all interfaces); set to `127.0.0.1` when placing behind a local reverse proxy. |

There is no generic `DATABASE_URL`, default localhost database connection, `AUTH_USER`/`AUTH_PASS` login, or automatically provisioned analyst.

## Development and verification

Provision/migrate a disposable dedicated database first, configure the scoped connections and `APP_ORIGIN`, and bootstrap an owner as above. For host development, use host-readable secret paths as described in the operations guide.

```bash
pnpm dev --hostname 127.0.0.1 --port 3000
```

Default checks do not opt in to database-writing integration fixtures:

```bash
node_modules/.bin/tsx scripts/check-release-boundary.ts
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Do **not** set `RUN_DATABASE_TESTS=1` on a production/operator shell. The isolated real-HTTP/provisioning fixture and its destructive scope are documented in [operations: verification](docs/OPERATIONS.md#verification). Test totals belong in execution reports, not a static README. CI runs frozen dependency installation, release-source/build-context boundary checks, lint, type checking, default tests, Next.js build and the runtime Docker image build; real database tests are an explicit manual opt-in job.

## Exports and automation

Use an explicit bound, for example `/api/blocklist?format=txt&max_rows=1000`. Requests exceeding their selected cap fail rather than silently claiming completeness. CDB rejects IPv6; select TXT or CSV instead. Provider roster exports also have explicit bounds.

Interactive export uses a verified session. Machine feed access uses a bearer token whose SHA-256 hash, `feed:read` scope, expiry and optional revocation are persisted in `app_feed_tokens`. **Token issuance/rotation/revocation is currently an operator database integration, not a shipped management UI or account CLI command.** Never put a feed token in a URL. These tokens authorize only the exact feed GET route, not general application APIs.

## Publishing and security

See [SECURITY.md](SECURITY.md) and [CONTRIBUTING.md](CONTRIBUTING.md). Keep runtime secrets, private operator output, dumps and local fixture state out of Git and build contexts. Before publishing, the owner must choose the distribution license and review repository history; no license is selected here. Any credential previously exposed in an old checkout or history must be rotated independently—deleting a line does not revoke it. This documentation does not claim a deployment security audit or absence of XSS. No deployment or publication is performed by these instructions.
