# Operations runbook

## Boundaries and prerequisites

Use only an application-owned dedicated PostgreSQL database. Do not point provisioning, migrations, fixtures, or maintenance at a shared SOC database. The app's telemetry connection is read-only; that does **not** mean the whole application is read-only: authentication, reputation, and optional maintenance have separate writers.

Docker examples use Compose v2, Linux host UID/GID ownership and the supplied overlays. Node.js 22 and the pnpm version in `package.json` are required for host commands. Container credentials are file-mounted. The installer creates directory mode `0700` and files `0600`; mount them under the generated `LOCAL_UID`/`LOCAL_GID`. Ensure secret directories and bootstrap output remain private on the actual host. Docker Compose file secrets are not an encrypted secret vault.

## Route A: bundled PostgreSQL

Follow the exact quick-start sequence in the [README](../README.md). Use the same project directory, `--env-file` and overlays consistently. The database has no published host port, joins an internal network, and persists in `pgdata`. Provision once, migrate explicitly, create the bootstrap token, then start the app. A root-only `docker compose up` does **not** create a database or initialize an owner.

For subsequent commands, this Bash helper preserves the selected deployment shape:

```bash
dc() {
  docker compose --env-file .runtime/secrets/compose.env \
    -f docker-compose.yml -f compose.postgres.yml -f compose.operator.yml "$@"
}
dc ps
dc logs --tail 100 app
```

Do not use `down -v` unless intentionally destroying the database and its volume. Do not rerun provisioning against existing login roles. Changing generated secret files does not rotate database passwords.

## Route B: dedicated database on an existing PostgreSQL server

A DBA first creates an **empty dedicated application database** (the examples use `ip_intel`) and an appropriate operator identity. Provisioning needs permission to create scoped roles, assign memberships, transfer the `public` schema owner, revoke schema creation and grant database connectivity. It cannot safely be run as an arbitrary read-only account. Do not reuse an existing incident database. Cluster-wide login names are fixed (`ip_intel_*_login`); multiple installations on one cluster need a reviewed role-naming/provisioning adaptation, not repeated provisioning over the same logins.

1. Generate scoped secrets using the hostname/port reachable **from the app container**, replacing `db.example.invalid` with your dedicated server's real name:

   ```bash
   pnpm install --frozen-lockfile
   pnpm install:secrets --host db.example.invalid --port 5432 --database ip_intel
   install -d -m 700 .runtime/owner
   ```

2. Using your secret manager or a private editor, create `.runtime/secrets/provision-database-url` with the DBA/operator connection to that dedicated database. Keep it `0600`. Do not put credentials in shell command arguments, terminal output, Git, tickets, or logs. Generated scoped URLs target the named server but do not infer your TLS policy: review them privately and configure validated PostgreSQL TLS appropriate to your infrastructure before remote use. Do not disable certificate validation as a shortcut.

3. Run provisioning and migration from a trusted host with connectivity and installed dependencies:

   ```bash
   PROVISION_DATABASE_URL_FILE="$PWD/.runtime/secrets/provision-database-url" \
     ROLE_PASSWORDS_FILE="$PWD/.runtime/secrets/role-passwords.json" pnpm db:provision
   MIGRATION_DATABASE_URL_FILE="$PWD/.runtime/secrets/migration-database-url" \
     pnpm db:migrate
   ```

   These commands read secrets without printing values. Host-side migration requires the generated endpoint to be resolvable from this host too; otherwise run the operator image in a reviewed network context with only the necessary secret mounts. Never supply the provision or migration credential to the web service.

4. Set `APP_ORIGIN` to the intended browser origin. Use only the root and account overlay—**not** the bundled database overlay:

   ```bash
   export APP_ORIGIN=http://127.0.0.1:3000
   docker compose --env-file .runtime/secrets/compose.env \
     -f docker-compose.yml -f compose.operator.yml run --rm --build account
   docker compose --env-file .runtime/secrets/compose.env \
     -f docker-compose.yml -f compose.operator.yml up -d --build app
   ```

5. Complete `/setup` using the protected token file and owner-chosen username/password, as in Route A. Restrict the provision/migration credentials to the host operator and remove the temporary provisioning access according to policy after initialization.

## Host development and optional mock telemetry

For a host process, set `AUTH_DATABASE_URL_FILE`, `READ_DATABASE_URL_FILE` and `REPUTATION_DATABASE_URL_FILE` to absolute **host** paths, not `/run/secrets/...` container paths. Secrets generated for the bundled container use `postgres:5432`, which is not automatically resolvable from the host; use a separate dedicated development database with a host-reachable endpoint or a reviewed development network setup.

```bash
export APP_ORIGIN=http://127.0.0.1:3000
export AUTH_DATABASE_URL_FILE="$PWD/.runtime/secrets/auth-database-url"
export READ_DATABASE_URL_FILE="$PWD/.runtime/secrets/read-database-url"
export REPUTATION_DATABASE_URL_FILE="$PWD/.runtime/secrets/reputation-database-url"
USE_MOCK_DATA=true pnpm dev --hostname 127.0.0.1 --port 3000
```

This replaces telemetry with synthetic data but **still requires migrated PostgreSQL for setup, users and sessions**. Mock mode also blocks normal external provider egress. The root Compose file does not pass `USE_MOCK_DATA` through automatically.

## Setup and password recovery

The account CLI supports only `bootstrap --out <new-file>` and `reset-password --username <name> --password-file <private-file>`. There is no shipped user-management or feed-token CLI. Username: 3–64 ASCII letters/digits/dot/underscore/hyphen, starting with a letter or digit. Password: 15–128 Unicode characters, preserved exactly; use a strong unique passphrase.

Bootstrap output must be a **new** file. If a token expired before installation, remove the expired local output file privately and rerun the account operator to mint a replacement. Do not try to bypass the installed marker. After successful setup, minting another bootstrap token is rejected, even if users are later deleted.

For a host-based password reset, create the new password file privately with mode `0600`, **without a trailing newline**, then run:

```bash
AUTH_DATABASE_URL_FILE="$PWD/.runtime/secrets/auth-database-url" \
  pnpm account reset-password --username owner --password-file /protected/new-password
```

Replace `owner` with the exact existing username and the file path with your private file. This updates that account and revokes all its sessions; it does not reopen setup or create a missing user. Clean up the password file according to host policy. For a container-only installation, run the same account command in the operator image with an explicitly reviewed private password-file mount; the default account service mounts only auth access and bootstrap output.

Session tokens are opaque, hashed in PostgreSQL, expire after 12 hours and are checked against the current durable account. Logout revokes the session. Maintenance execution/cancellation additionally requires reauthentication within five minutes. Preserve the installation/users/session tables during a restore if retaining access state is intended; restoring older auth state can resurrect older sessions, so plan revocation as part of recovery.

## Production ingress and health

Put a trusted HTTPS reverse proxy in front of the application for production or public exposure. Set `APP_ORIGIN` to the **exact external HTTPS origin** (or exact loopback/RFC1918 LAN HTTP origin for internal lab networks), with no path or trailing slash; if changing `APP_PORT`, set the matching port. The application uses this configured origin for cookie security and mutation-origin checks, not arbitrary Host or forwarded headers. Restrict alternate hostnames at the proxy, apply request limits, avoid logging cookies/Authorization headers or setup bodies, and keep the internal app port inaccessible publicly. A concrete proxy/certificate deployment remains operator work.

- `GET /api/health`: process liveness only; no database promise.
- `GET /api/ready`: validates origin configuration, the installation singleton, required markers `001`, `002`, `004`, and zero-row column/access probes for authentication, feed tokens, telemetry and reputation through their scoped readers. When a maintenance connection is configured it additionally requires marker `003` and probes maintenance plans/jobs/policies/audit through that connection. It can be ready **before owner setup**. It does not prove mutation grants, ownership/recovery assertions, migration checksums, provider availability, TLS ingress or restore readiness.

For the loopback development configuration:

```bash
curl --fail http://127.0.0.1:3000/api/health
curl --fail http://127.0.0.1:3000/api/ready
```

Readiness `503` means investigate configuration, network access, permissions and migrations; it is not an instruction to reset an installed database. Application errors deliberately suppress raw PostgreSQL/provider details. Do not enable broad secret-bearing query/environment logging to troubleshoot.

## Optional external reputation

Only AbuseIPDB is implemented as a live client. The flag is disabled by default. Enable `ENABLE_EXTERNAL_ENRICHMENT=true` only after supplying a provider key and a scoped reputation writer. Queries require global-unicast IPs; localhost/private/reserved addresses are not eligible for provider egress. Results have a seven-day freshness window; provider failures are surfaced, not treated as clean reputation. Monitor quota independently.

### In-UI Management (Recommended)
Administrators can configure the AbuseIPDB API key and toggle live lookups directly from the Web UI under **Settings > External Enrichment** (`/settings/enrichment`). The key is stored securely in PostgreSQL (`ip_intel_installation.abuseipdb_api_key`) and takes effect immediately without container restarts. The UI also provides a live connection test button to verify provider connectivity and API key validity before saving.

### Environment Variable Fallback
For host use or headless environments, prefer `ABUSEIPDB_API_KEY_FILE=/protected/abuseipdb-key` or `ABUSEIPDB_API_KEY` in your private environment file. Database-configured keys in `ip_intel_installation` take precedence over environment variables when present. Do not put secrets in committed YAML, `.env.example`, shell history, or command-line literals. Setting both `NAME` and `NAME_FILE` is rejected.

## Optional maintenance and one-run retention

Maintenance is disabled by default: its secret is not mounted by the root Compose service. Adding `compose.maintenance.yml` is an explicit privilege escalation. Before enabling:

1. Confirm exclusive application ownership of `public.ip_intel_reputation`; any inbound foreign key makes maintenance unsafe and is rejected even when it does not cascade.
2. Apply migration `003_maintenance.sql` with the migration identity and verify the scoped grants. Do not grant general SQL, account, or telemetry mutation rights.
3. Create a protected recovery checkpoint and demonstrate restoration to an isolated database before authorizing bulk deletion.
4. Only then set `MAINTENANCE_OWNERSHIP=ip-intel-owned-v1`, `MAINTENANCE_RECOVERY_CHECKPOINT_ID` and `MAINTENANCE_RECOVERY_VERIFIED_AT` in your private runtime configuration. The checkpoint ID is 3–128 safe identifier characters; the verification timestamp must parse as a non-future timestamp. Use UTC ISO form.

The checkpoint variables are **operator assertions**, not automatic backup creation, independent restore verification, an accepted filesystem path, or a browser restore feature. Do not invent a checkpoint ID to unlock deletion. The service requires a checkpoint for deletion of more than one owned reputation row. Invalidation clears freshness, not telemetry evidence.

For Route A, extend the helper and recreate the app after configuring the assertions:

```bash
dcm() {
  docker compose --env-file .runtime/secrets/compose.env \
    -f docker-compose.yml -f compose.postgres.yml -f compose.operator.yml \
    -f compose.maintenance.yml "$@"
}
dcm up -d --build app
```

For Route B omit `-f compose.postgres.yml`. In `/settings/database`, an administrator selects an explicit scope, previews the exact plan, reauthenticates, enters the displayed confirmation, executes and reads back job/audit state. Plans expire after ten minutes and include at most 200 versioned targets. Changed revisions, actor permission loss, expired plans and unsafe dependencies are rejected. Retention snapshots only currently matched targets, queues a one-run job, and initially reports zero affected rows. Run its bounded worker **before plan expiry**:

```bash
dcm run --rm --build maintenance-worker
```

The supplied command processes at most ten jobs and exits. It is not a daemon, cron service or recurring policy scheduler. Completion, cancellation or failure disables that one-run policy. Later matching rows are not swept automatically. Review affected counts and audits after execution; cancellation of queued work does not mutate reputation. Cache/events, users, and arbitrary tables are outside maintenance scope.

## Backups, upgrades and recovery

Backups are an operator responsibility. Protect database data, role/configuration material and credentials separately with access controls and encryption appropriate to policy. A Docker volume is persistence, **not a backup**. The product does not create or restore backups.

Before upgrade or destructive maintenance: take a checkpoint with an independently authorized backup identity, record the application/migration version, verify a restore in an isolated database, and document how users/session revocation and monotonic reputation revisions will be handled. Do not restore the reputation rows alone with stale revisions into a live system containing old maintenance plans; stop writers/workers and invalidate outstanding plans through a reviewed recovery procedure.

For an ordinary bundled upgrade, with tested backups and an approved source/image revision:

```bash
dc stop app
dc run --rm --build migrate
dc up -d --build app
dc ps
```

For an existing database, run the host `pnpm db:migrate` command from Route B while application writers are stopped, then rebuild/restart its app. Migrations run in filename order under a PostgreSQL advisory lock, each in a transaction, with SHA-256 checksums in `ip_intel_migration_history`. Previously applied SQL with a changed checksum fails. Do not edit applied migrations; add a reviewed new migration. There is no automatic down-migration or guaranteed code-only rollback after a schema change. A failed migration requires diagnosis, not dropping telemetry or bypassing checksum history.

## Uninstall and data retention

Uninstall is an operator-approved action, **not** an automatic production step. The default is to remove application containers while retaining database data and recovery credentials. Schedule downtime, stop integrations and any separately scheduled writers/workers, and review [backups and recovery](#backups-upgrades-and-recovery) before proceeding. Do not run provisioning, migrations or maintenance deletion as an uninstall step.

### Select the exact installed deployment

Run from the original installation directory with the **same Compose project identity** (`-p`/`COMPOSE_PROJECT_NAME` if used), private `--env-file`, secret-directory setting and ordered overlays used to install. Preserve privately configured variables such as `APP_ORIGIN`. Do not guess the project name from a directory basename or switch to a different checkout. The Route A `dc` helper above is suitable only if it matches that installation; if maintenance was enabled, use the `dcm` helper instead, including its overlay. Retain any reviewed local overlays too.

For Route B, use this helper instead, again adding the original project selection and any installed maintenance/local overlays:

```bash
dcb() {
  docker compose --env-file .runtime/secrets/compose.env \
    -f docker-compose.yml -f compose.operator.yml "$@"
}
dcb ps -a
```

Before removing containers, inventory the selected project's containers, mounted secrets/bind paths and volume metadata without printing secret values. For Route A, record the actual named volume mounted at `/var/lib/postgresql/data` on the selected project's `postgres` container, and verify its Compose project/volume labels and exclusive ownership. `pgdata` is the **logical Compose key**, not a guaranteed Docker volume name; never guess a `<project>_pgdata` name. Preserve this inventory and the deployment configuration in protected recovery records. Stop if the project, mounts or ownership do not match expectations.

### Default: remove the app, keep its data

After that approval/inventory, for Route A without maintenance:

```bash
dc stop app
dc rm -f app
dc ps -a
```

This stops/removes only the app container. The bundled PostgreSQL service and its named `pgdata` volume remain, including telemetry, reputation, installation state, users, sessions, feed tokens and maintenance metadata. Container-local writable files are not retained by container removal; inventory and preserve any required non-database artifacts first. Images, host secrets, bootstrap output, backups and source checkout are not removed.

With maintenance enabled, stop any running `maintenance-worker` containers in the same selected project first and ensure no external scheduler can relaunch them; use the matching `dcm` helper for app removal. Do not launch a worker to drain queued jobs during retirement. For Route B use `dcb stop app`, `dcb rm -f app`, then `dcb ps -a` with the matched overlays. Route B's external database, schema, records and PostgreSQL roles are **not automatically deleted or revoked**; they remain under the DBA/operator's control. Do not drop an external database or roles as part of app-only removal.

If the approved scope is to remove the **entire bundled Compose stack**, not just the app, first stop all writers/workers, then use the matched Route A helper:

```bash
dc down
dc ps -a
```

Use `dcm` instead if that was the installed overlay set. This stops/removes project containers and Compose-managed networks, but retains the named `pgdata` volume by default. Never add the volume-removal flag, use volume/system pruning, or perform broad filesystem cleanup in this retention path. Keep the recorded actual volume identity for reattachment. For Route B, `dcb down` removes only that Compose deployment, not the externally hosted database. Verify the selected containers are gone and the inventoried volume still exists using scoped Docker metadata inspection; these commands do not prove a backup or restore works.

### Retained secrets, artifacts and reinstall

Keep `.runtime/secrets/` (including scoped role DSNs, role-password material, bundled PostgreSQL password and `compose.env`), any custom secret location, and deployment/ownership records private while the data is retained for reinstall/recovery. Preserve directory mode `0700`, file mode `0600`, and the original authorized owner/UID/GID; maintain protected encrypted recovery copies under policy. Do not print values or recursively change ownership on database storage. Do not delete credentials or the checkout/configuration before the backup and recovery path are validated. Review retained images, logs, bind-mounted output, exports and backups individually by exact inventoried path and retention policy; app removal does not erase these artifacts.

A consumed or expired `.runtime/owner/bootstrap-token` file is disposable according to host policy after its status is confirmed; it is not a database credential or backup. In contrast, role DSNs/password material must remain available until the application/data is deliberately retired or an independently validated replacement recovery mechanism exists. Do not regenerate secrets or rerun provisioning over retained roles for a reinstall: the installer refuses overwrite and new files do not rotate existing database passwords. Reattach the verified retained volume using the same project/configuration, reuse the protected credentials, and follow the upgrade/recovery procedure. Retained installation state means setup does not reopen; use documented password recovery if necessary.

### Separate opt-in: permanent data destruction

Permanent destruction is **not the default uninstall** and has no copy-paste deletion command here. Require a separate explicit owner/DBA approval, applicable retention/legal-hold review, and an access-controlled backup whose restore has been verified in isolation. Confirm the precise inventoried volume belongs exclusively to this installation, all consumers are stopped, and the operator understands that removing it irreversibly destroys its database contents; a volume is not a backup. Only then may the authorized operator devise a narrowly targeted removal of that exact volume under local change control. Never use guessed names, broad pruning or directory-wide deletion. For Route B, any eventual database/role retirement is a separate DBA-controlled dependency/ownership review, not a Compose action. Dispose of retained credentials and backups only after approved retirement and validated recovery/retention obligations permit it; deleting a local secret file does not revoke a database role or provider key.

## Feeds and bounded exports

Machine `GET /api/blocklist` accepts a 43-character base64url bearer token. Store only its SHA-256 hash in `app_feed_tokens` with `feed:read`, an expiry and a unique ID; revocation is a timestamp. Issuance/rotation/revocation requires a reviewed operator database integration—there is no supplied CLI/UI for it. Use independent least-privilege integration access, never give clients the auth database credential. Do not put tokens in query strings, logs, frontend bundles or public instructions.

The feed supports parameters `format` (`csv`, `txt`, `cdb`), `min_score` (0–100, default 75), `min_alerts` (0–20, default 1 in API; set `min_alerts=0` to include standalone reputation-only indicators without local alerts), `days` (lookback window), and `include_reputation=true` (evaluates `reputation_checked_at` for indicators where local `last_seen` is null).

Use `max_rows=1000` as an explicit operational bound; handlers currently allow selecting up to 10000. Exceeding the chosen cap returns `413`, not a silently truncated complete feed. CDB is IPv4-only (`422` if selected data contains IPv6). TXT/CSV support IPv6. Validate content and counts before atomically replacing any firewall list; the product does not deploy policy to a firewall.

## Verification

The default checks are safe without a database opt-in:

```bash
pnpm install --frozen-lockfile
node_modules/.bin/tsx scripts/check-release-boundary.ts
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker build --target runner -t ip-intel:verification .
```

They do not establish production deployment readiness. Report actual counts and failures from each execution; do not treat skipped integration tests as passed live tests.

### Destructive isolated HTTP/provisioning fixture

`RUN_DATABASE_TESTS=1` is **only** for the disposable container `ip-intel-implementation-test-db` on loopback port **55437**, using `.secrets/review-db.env`. It is not a generic integration switch to run against your configured application database. The targeted suites create/drop synthetic databases and roles, truncate fixture account tables and start/restart a real local Next.js process. Do not reuse operational credentials or point them at another server. The optional manual CI job builds this fixture from a fresh random password, applies all versioned SQL to its baseline database, and removes the container afterward. Fixture baseline SQL is applied directly, not offered as a replacement for the checksummed deployment runner. Keep these suites sequential (`--no-file-parallelism`): provisioning creates/drops fixed cluster-wide login roles even though the HTTP suite uses a separate synthetic database.

After creating and verifying that exact isolated fixture with **all versioned migrations** applied in filename order in `ip_intel_test`, the targeted command is:

```bash
RUN_DATABASE_TESTS=1 pnpm exec vitest run \
  tests/operator-database.test.ts tests/account-lifecycle.test.ts \
  tests/auth-live.test.ts --no-file-parallelism
```

Do not run the entire suite with that flag: `tests/backend-postgres.test.ts` additionally requires an explicit, separately marked `SYNTHETIC_TEST_DATABASE_URL` and the exact database name `ip_intel_synthetic_test`; maintenance PostgreSQL/browser fixtures have a different synthetic-only opt-in and directory validation. Those are separate verification procedures, not a fallback to any available DB. No database-writing tests run by default. Do not enable unrelated fixture flags in ordinary CI/development shells.

Static Compose validation uses `docker compose ... config --quiet` with the chosen files and a throwaway secret-directory path. Do not paste full rendered Compose output: it can include direct environment secrets. Configuration parsing is not evidence that container startup, remote TLS, HTTPS ingress, provider quota or backups work.
