# Backend implementation handoff

## Contracts
- `IntelRow` from `lib/db.ts` replaces cache-row type for merged lookups: `first_seen` and `last_seen` are `string | null`; reputation-only rows have zero telemetry and no observation timestamps.
- `getProviderIps(name, limit, offset)` -> `{items,total}`; HTTP provider detail uses max limit 100 and adds `total`, `limit`, `offset`, `hasMore`. Frontend must paginate, not assume `ips` is complete.
- Dashboard fields all use returned half-open UTC `scope`; `units` labels event counts (MITRE is event-technique associations); `topAsns` currently groups provider ISP names.
- Detail, summary and evidence share from/to/alert_type/outcome/target_host filters. Summary does not depend on limit/offset. Detail UI controls 30/90-day range, resets pagination on filter changes and retains plain-text evidence expansion.
- Enrichment accepts `{ips, checkCacheFirst}`; max 100 external / 200 local; rejects malformed members and overlimits instead of filtering/truncating. Rich result shape retained with added `scoreContext: 'reputation-only'` and `reputationSource`; zero-score verdict is Unknown without positive telemetry, not Clean.
- Shared reputation freshness is 168h. Only explicit ENABLE_EXTERNAL_ENRICHMENT=true plus ABUSEIPDB_API_KEY permits live egress; mock mode blocks all default fetches. Explicit intercepted dependency exists only in provider unit tests.
- `004_feed_tokens.sql` defines app_feed_tokens. Auth role has SELECT only. Operator creates 32-byte base64url raw tokens once; store SHA-256 hash only with feed:read and expiry. Feed accepts bearer tokens or permissioned interactive sessions.
- API rate buckets use verified session userId or verified token ID, never forwarded headers. Single-process bounded TTL limiter; distributed store required before replicas.
- Export max_rows defaults/max 10000; overflow 413, no truncated success. CDB IPv6 is rejected with 422; txt/csv preserve IPv6.

## Integration review follow-up
- Proxy now validates bearer tokens for exact GET `/api/blocklist` before session enforcement (owned by foundation worker); production HTTP deployment remains the release owner's verification gate.
- Provider client now uses shared `readSecret('ABUSEIPDB_API_KEY')`: direct environment and `_FILE` configuration agree with capabilities, conflicting/unreadable sources fail closed, and mock egress protection remains intact. Regression was observed failing before the fix.
- `tests/enrich.test.ts` already contains the formatter owner's truthful `0% Reported Abuse Confidence (not a safety verdict)` expectation; left unchanged.
- Confirm migration 004 provisioning/revocation operational instructions in release review. No live provider called.

## Safe PostgreSQL integration opt-in
- Default test runs skip the entire PostgreSQL suite, including setup and teardown. No Docker/container or credentials-file assumptions remain.
- Opt in only with `RUN_DATABASE_TESTS=1` and explicit `SYNTHETIC_TEST_DATABASE_URL`. The URL must use PostgreSQL on loopback with an explicit port/user, database exactly `ip_intel_synthetic_test`, and no URL options. It never falls back to application database URLs.
- Before applying migrations or mutating fixtures, the suite reads `public.ip_intel_synthetic_fixture` and requires its sole `purpose` to equal `disposable-backend-tests`. Create this marker only in a newly created disposable database, never in any operational database.
- Portable native PostgreSQL reproduction (run from this sanitized workspace):
  ```sh
  initdb -D .backend-pg -A trust --no-locale -U synthetic_backend
  pg_ctl -D .backend-pg -l .backend-pg/server.log -o "-h 127.0.0.1 -p 55441 -k ''" start
  psql -X -h 127.0.0.1 -p 55441 -U synthetic_backend -d postgres -v ON_ERROR_STOP=1 -c 'CREATE DATABASE ip_intel_synthetic_test'
  psql -X -h 127.0.0.1 -p 55441 -U synthetic_backend -d ip_intel_synthetic_test -v ON_ERROR_STOP=1 -c "CREATE TABLE ip_intel_synthetic_fixture(purpose text NOT NULL); INSERT INTO ip_intel_synthetic_fixture VALUES ('disposable-backend-tests')"
  RUN_DATABASE_TESTS=1 SYNTHETIC_TEST_DATABASE_URL=postgresql://synthetic_backend@127.0.0.1:55441/ip_intel_synthetic_test pnpm exec vitest run tests/backend-postgres.test.ts
  pg_ctl -D .backend-pg stop
  ```
- The trust-auth cluster is disposable, loopback-only, and stores synthetic data only. TCP-only `-k ''` avoids long Unix socket path failures. Choose a free loopback port if 55441 is occupied; use the same port in all commands. External database installations can be used with the same dedicated name/marker contract; supply synthetic-only credentials privately if required.

## Follow-up verification commands/results
- RED: `pnpm exec vitest run tests/database-test-safety.test.ts` — two expected failures for unconditional hooks and hardcoded Docker/credential target. GREEN after fixture rewrite: two passed; default database suite five skipped.
- RED: `pnpm exec vitest run tests/provider-client.test.ts` — key-file test failed with disabled configuration; GREEN after shared secret read: five passed.
- Focused backend run: `pnpm exec vitest run tests/provider-client.test.ts tests/enrich.test.ts tests/api-input.test.ts tests/api-routes.test.ts tests/api-authorization.test.ts tests/data-hardening.test.ts tests/enrich-persistence.test.ts tests/export-http.test.ts tests/export-rate.test.ts tests/feed-auth.test.ts tests/forwarded-rate.test.ts tests/stats-parity.test.ts tests/roster-metrics.test.ts tests/telemetry-aggregates.test.ts tests/database-test-safety.test.ts` — 15 files / 45 tests passed.
- `pnpm exec vitest run` — 41 files passed, seven skipped; 165 tests passed, 17 skipped.
- Explicit PostgreSQL command above — five passed, including fresh-schema initialization; repeated successfully before and after PostgreSQL restart. Marker read back unchanged after restart. Synthetic fixture teardown reads confirmed unchanged telemetry values and persisted reputation during each test. Cluster stopped afterward.
- Negative explicit target checks — `/production` rejected before connection with `Refusing non-synthetic database target`; empty URL rejected with `Explicit SYNTHETIC_TEST_DATABASE_URL required`; neither produced teardown errors.
- `pnpm exec tsc --noEmit`, `pnpm exec eslint lib/provider-client.ts tests/provider-client.test.ts tests/backend-postgres.test.ts tests/database-test-safety.test.ts`, and `git diff --check` — all exit 0.
- Vite warns about CommonJS loading ESM configuration; non-blocking. Full application HTTP/browser deployment testing remains a parent release gate. No commits.

## Verification
- Targeted synthetic unit/direct-handler/render tests and actual isolated PostgreSQL tests executed. PostgreSQL checks read-only WITH enforcement, scoped pagination/critical outcomes, dashboard SQL, reputation-only merges, preservation of telemetry, feed migration replay and token expiry/revocation.
- No production DB/env/dump used; PostgreSQL follow-up ran in a newly initialized disposable `.backend-pg` cluster, which was stopped and removed afterward. No commits.
