# IP Intel Product Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current internal prototype into a reproducible, secure self-hosted project suitable for the owner's GitHub and subsequent controlled deployment.

**Architecture:** Keep the Next.js modular monolith and PostgreSQL. Separate telemetry reads, reputation persistence, provider egress and scoped aggregation. Preserve evidence drill-down and existing workflows; avoid a framework rewrite.

**Tech Stack:** Next.js 16, React 19, TypeScript, pg, Zod, TanStack Query, Vitest, pnpm, Docker; add Playwright and isolated PostgreSQL integration fixtures during implementation.

**Spec:** `docs/reviews/2026-11-04-readiness-review.md` (observed baseline, findings F01–F11 and release boundaries), plus the owner-requested revision below. Revision requirements override conflicting earlier task wording.

## Owner Review Revision — Unified Investigation, First-Run Setup, Optional Bundled PostgreSQL

Status: **proposed design for owner review; implementation not started**.

### A. One Investigation Workbench, Explicit Data Modes

Consolidate `Investigation & Enrich` and `Bulk Lookup` into one **Investigate** navigation item and `/investigate` page. Single versus bulk is an input count, not a separate destination. The screenshots confirm overlapping paste/upload/cache/live controls; preserve useful behavior while removing duplicate screens.

Proposed interaction:
1. One shared input accepts a single IP, pasted batch or CSV/TXT upload; show valid, invalid and duplicate counts with explanations, never silently discard excess input.
2. Default mode **Local Lookup**: reads local telemetry/reputation only, **zero provider requests and zero reputation writes**. Button: **Search Local**. Show hits, misses and reputation freshness.
3. Explicit mode **External Enrichment**: state that selected public indicators leave the installation for the configured provider, may consume quota and may update the configured reputation store. Button: **Enrich Selected**. Disabled with a reason if provider configuration or permission is missing. Initial supported live provider is AbuseIPDB; do not advertise live VT until implemented and tested.
4. Within external mode, **Reuse fresh cache** is on by default. Stale/missing entries are eligible for provider lookup; **Force refresh** is an explicit alternative with quota/egress warning. Cache-only never silently falls back to external mode.
5. One shared result table supports local investigation, enrichment status, source/freshness, per-item errors, selection and CSV/IoC export. Label provider score versus local telemetry separately. Existing Alpha/Charlie formatting remains available as export choices, not separate investigation pages.
6. Switching modes retains input and selections but performs no requests. Input edits cannot leave old results looking current; show the submitted input snapshot and invalidate selection for changed input. Use one shared normalization path; proposed batch ceiling is 200, with external jobs chunked within backend provider/request limits and explicit progress/cancellation.
7. Legacy `/bulk` and `/enrich` entry points redirect to `/investigate` with the correct mode, preserving supported IP query values but never keys/secrets in URLs. Update navigation and links from IP detail; avoid duplicate editable implementations.
8. Account badges reflect real permissions, not a hardcoded `read-only` label. Read-only analysts can use local lookup; external enrichment/export actions require their corresponding permission.

**Files:** Create `app/investigate/page.tsx`, `components/investigation/IndicatorInput.tsx`, `components/investigation/InvestigationResults.tsx`, `lib/investigation-input.ts`, `tests/investigation-input.test.ts`, `tests/e2e/investigation.spec.ts`; modify Navbar, old page routes and existing detail links. Keep local and external backend operations separate for authorization/egress; one UI does not mean an ambiguous auto-enrich endpoint.

**Interfaces:** `InvestigationMode = 'local' | 'external'`; `parseIndicatorInput(text: string): {valid: string[]; invalid: string[]; duplicateCount: number}`; `InvestigationSubmission = {ips: string[]; mode: InvestigationMode; cachePolicy: 'fresh-first' | 'force-refresh'}`. Local mode rejects force-refresh and never invokes a provider. Share normalization with server-side validation; frontend parsing is not a security boundary.

**TDD/acceptance:**
- [ ] RED -> GREEN: one-IP and batch/file inputs use the same workbench; duplicates/invalid/oversized input produce visible accounting, with no silent truncation.
- [ ] RED -> GREEN: local lookup and mode switching trigger zero provider calls; explicit external submission with permission calls only approved eligible indicators.
- [ ] RED -> GREEN: fresh-first versus forced refresh, missing provider key, denied permissions, partial failures and cancellation have accurate result/status UI.
- [ ] E2E: navigation contains only one investigation entry; legacy links preserve intended mode/input; mode switching retains input and cannot mislabel stale results.
- [ ] E2E: existing per-IP evidence drill-down, CSV and both IoC report variants remain functional. No layout regression hides evidence.

### B. First-Run Administrator Setup — No Demo Credentials

Remove demo credentials, quick-fill, default-password hints and authentication fallbacks **entirely from the shipped login flow**, not just in production. Mock/synthetic fixtures are test data, not a publicly usable account.

Proposed installation lifecycle:
1. Configure the selected database deployment using the README instructions. Database provisioning/migration remains a local install operation, not an unauthenticated browser form accepting privileged DSNs.
2. A local operator explicitly initializes setup mode and receives a cryptographically random, short-lived, single-use bootstrap token through a protected local CLI/file flow. Do not expose tokens on public status pages, URLs, normal container logs or committed config. Bind initial installation to loopback by default; require TLS/protected access for remote setup.
3. `/setup` requires this bootstrap token and lets the owner choose the initial administrator username and password plus confirmation. Password policy proposal: minimum 15 characters, maximum 128 characters, spaces/Unicode allowed, no arbitrary composition rules; secure maintained password hashing with unique salt. No passwords in logs, URLs, localStorage or response bodies.
4. Create the first admin and consume bootstrap authorization atomically. Database constraints/transaction locking must prevent two admins being created by concurrent first-run requests. Disable setup after completion, including after restart. Then use ordinary verified login.
5. No self-service public registration in this release. Existing installations require explicit administrator bootstrap/migration instructions; an empty or unreachable auth table must not silently reopen setup.
6. Document local administrative recovery/password reset requiring host/operator access; never ship a universal recovery password. Provider API keys are optional and configured separately after account creation; local investigation must work without them.

**Files:** Create `app/setup/page.tsx`, `app/api/setup/route.ts`, `lib/bootstrap.ts`, `lib/user-repository.ts`, an auth migration, local bootstrap/recovery CLI and `tests/integration/bootstrap.test.ts`; modify auth/login/proxy/config and Compose configuration.

**Interfaces:** `getInstallationState(): Promise<'setup-required' | 'ready'>` (dependency failure is an error, not setup-required); `completeBootstrap(input: {token: string; username: string; password: string}): Promise<void>`. A dedicated auth writer manages accounts/sessions only; telemetry readers and reputation writers cannot modify users. Bootstrap token is stored hashed, expires after a proposed 30 minutes and is consumed transactionally. Failed, expired, used or unauthorized bootstrap attempts fail closed and are throttled.

**TDD/acceptance:**
- [ ] RED -> GREEN: no demo account/password/quick-fill remains in UI, README operational examples or server fallbacks; login before bootstrap cannot grant access.
- [ ] RED -> GREEN: missing/wrong/expired/used token cannot create an account; DB outage cannot open setup; simultaneous valid bootstrap requests create exactly one first administrator.
- [ ] RED -> GREEN: password stored as a verified secure hash, validation obeys documented policy, unauthorized clients cannot overwrite credentials or restart setup.
- [ ] E2E: fresh install -> authorized setup -> login -> logout -> restart -> same credentials work and setup remains closed. Repeat for bundled and external database paths.
- [ ] Verify operator recovery invalidates appropriate sessions without exposing credentials; test fixtures use isolated per-run credentials only.

### C. Two Supported PostgreSQL Installation Paths

Ship **the database architecture and migrations**, never the operational database, dumps, telemetry or credentials. PostgreSQL is required for the persistent installation, but using the **bundled PostgreSQL container is optional**. No silent installation onto the host and no requirement to install PostgreSQL manually for the bundled path.

**Path 1 — Bundled PostgreSQL (recommended for new installations):**
- App plus optional Compose database overlay/profile, named persistent volume, healthcheck and owned migrations. Proposed files: `compose.postgres.yml`, `migrations/`, `scripts/db-bootstrap.mjs`.
- Explicit install helper generates unique installation secrets into permission-restricted runtime files; no fixed DB password, no secrets in image/build arguments. Use service DNS/private bridge networking; database port is not published by default, and the application binds loopback by default.
- Migration job uses a separate migration role. Runtime telemetry reader, reputation writer and auth writer have scoped privileges. Startup waits for schema readiness rather than granting app superuser rights.
- Restart preserves data. Upgrade backs up and migrates explicitly. Normal stop must not delete volumes; README clearly marks any destructive reset command.

**Path 2 — Existing PostgreSQL:**
- App-only deployment, no bundled DB started. Document supported PostgreSQL version(s) after testing, connectivity/TLS validation, dedicated database/schema and scoped role provisioning, migration permissions, and separate runtime connections/secrets.
- Existing PostgreSQL **server** does not imply compatible telemetry **schema**. Fresh users get an owned empty IP Intel schema; existing compatible telemetry integrations require documented mapping/version checks. Do not infer schema compatibility or auto-import operational records.
- Never run destructive migration on arbitrary existing telemetry tables; detect incompatible versions and stop with actionable guidance. Coordinate shared Arbiter integration explicitly.
- No automatic fallback to localhost or secondary DB when the configured server is unavailable. Readiness fails accurately without returning secrets.

**README deliverable:** a visible two-path installation chooser with prerequisites, exact tested commands, secret configuration, migration/bootstrap-account sequence, provider-key optionality, data-ingestion expectations, upgrade, backup/restore, troubleshooting and uninstall/data-retention instructions. Explain that bundled PostgreSQL starts empty: reputation-only use is possible, but local telemetry analytics require an explicitly configured ingestion/integration source. Synthetic demo data is opt-in and cannot seed an operational database. Include architecture diagrams for both paths and a permissions/configuration matrix.

**TDD/acceptance:**
- [ ] From a clean clone on a machine without a PostgreSQL service, bundled path starts an isolated DB, migrates, completes account setup, persists synthetic data and survives restart.
- [ ] App-only path works against an independently provisioned synthetic PostgreSQL server; bundled database is not started and no unintended DB port is exposed.
- [ ] Fresh empty DB, unsupported/incompatible schema, invalid credentials/TLS, absent permissions and unavailable DB produce safe documented outcomes with no hidden fallback or data changes.
- [ ] Both paths pass migration replay, least-privilege checks, synthetic recovery, setup/login and local-investigation tests; optional enrichment remains disabled until configured.
- [ ] Execute README commands verbatim for both paths in isolated environments before calling either path supported.

### D. Remove Duplicate Overview Navigation

Owner request: remove the **Overview** navigation item, not the home page. Verified source: `components/Navbar.tsx:53-59` includes Overview pointing to `/`, and the brand Link at line 67 already points to `/`.

- Preserve `/` and its existing home content; clicking the **IP INTEL** brand remains the home action.
- Remove Overview from both desktop and mobile navigation. Give the brand an accessible home label and keyboard focus treatment; indicate the home state accessibly without creating another duplicate menu item.
- Preserve **Analytics** (`/dashboard`) as a distinct destination; do not confuse home navigation cleanup with deleting analytics.
- Proposed navigation: brand/home | Investigate | Providers / ASN | Analytics | Blocklist Feeds | Settings (admin only).

**Files:** Modify `components/Navbar.tsx`; add navigation coverage in `tests/e2e/navigation.spec.ts`.

**Acceptance:**
- [ ] Desktop/mobile show no Overview item and exactly one Investigate entry; brand click/keyboard activation reaches `/` and existing home widgets still work.
- [ ] Analytics and other existing routes remain reachable; restricted Settings does not appear for analysts and is denied by the backend regardless of visibility.

### E. Administrator Database Management — Scoped and Auditable

Owner request: add a way to view and manage database state, including deletion. Proposed location: **Settings -> Database**, `/settings/database`, restricted to administrators with `database:read` or `database:manage` as appropriate. This is application-scoped maintenance, **not a general SQL console or PostgreSQL server administration panel**.

**Planning privacy boundary:** this request authorizes adding a feature to the plan, not reading current database rows or executing deletions. No operational records are to be inspected during this planning task. Later verification uses isolated synthetic records; production row access or deletion still requires explicit approved scope.

#### E1. View Health, Storage and Ownership

- Display safe connection identity (deployment type, database/schema alias), connectivity, schema/migration version, table counts, storage estimates, freshness and maintenance-job state. Never show passwords, full DSNs or raw error payloads.
- Counts/size estimates are labeled as technical metadata; no automatic raw-log sampling. Offer paginated/filterable IP Intel record browsing and per-record details only to authorized application users, with sensitive raw telemetry hidden by default and separately permissioned.
- Label each resource **IP Intel-owned**, **shared/external telemetry**, or **unverified ownership** using explicit installation configuration plus validated schema compatibility, not table naming guesses. Unknown ownership means read-only.
- Support a redacted **Test Connection** and capability check. Connection-secret replacement is performed via protected operator configuration with restart/revalidation guidance, not plaintext browser DSN editing or a public arbitrary-host connection probe.

#### E2. Manage Data Without Destroying Shared Telemetry

- Initial writable scope: explicitly IP Intel-owned reputation cache entries, app-owned maintenance jobs and retention policies. Provide scoped cache invalidation, selected-entry deletion and prune-by-age with a dry-run preview.
- Distinguish **invalidate reputation** (mark stale; preserve telemetry and identity) from **delete reputation metadata** and **delete an owned indicator**. Disallow deletion of a parent/indicator with event references; do not rely on an existing `ON DELETE CASCADE` to remove evidence. Prefer separating reputation storage from shared cache/event entities before enabling maintenance writes.
- Shared/external telemetry, including tables also consumed by Arbiter, is **read-only by default**. Do not enable event deletion, full-table clear, database drop, schema drop or arbitrary SQL in the first release. A future event-retention capability needs explicit ownership approval, backup/restore and separately reviewed semantics.
- Admin can set retention for owned reputation data, inspect pending/completed maintenance jobs and cancel queued work. Retention defaults to **disabled** until explicitly configured; timezone, cutoff, scope and next-run time are visible. Enabling a policy requires the same preview/confirmation gate as manual cleanup.
- Runtime app roles remain least-privileged. An optional dedicated maintenance role is limited to approved owned tables/operations; telemetry reader, reputation writer and auth writer cannot acquire broad DELETE/DDL rights. Database management unavailable in an installation lacking maintenance capability must show a reason, not silently elevate permissions.

#### E3. Destructive Action Workflow

1. Choose resource, operation and exact selection/filter; preview affected record count, table ownership, cutoff, dependencies and whether backup/recovery is available. Do not fetch or display raw logs to calculate impact.
2. Require recent administrator reauthentication, CSRF/origin protection and typed confirmation for destructive operations. Bulk deletion requires a verified recovery checkpoint for owned data or remains disabled.
3. Server issues a short-lived single-use plan identifier tied to actor, operation, explicit scope and a fingerprint/version of the target selection. Execution cannot broaden scope or delete newly matching records silently; reject expired/changed scope with 409 and require a new preview.
4. Execute bounded transactions/batches with idempotency, concurrency controls and accurate per-job progress. Cancellation stops future batches; report already committed deletions honestly. No fake global rollback after partial commits.
5. Write a protected audit record containing actor, action, scope fingerprint, technical counts, timestamps and outcome, without raw telemetry, secrets or unnecessary IP lists. Maintenance users cannot erase this audit trail through the same UI. Return a clear recovery path where supported.

**Proposed files:** Create `app/settings/database/page.tsx`, `app/api/admin/database/status/route.ts`, `app/api/admin/database/records/route.ts`, `app/api/admin/database/maintenance/preview/route.ts`, `app/api/admin/database/maintenance/execute/route.ts`, `lib/database-management.ts`, `lib/maintenance-repository.ts`, owned maintenance/retention/audit migrations and `tests/integration/database-management.test.ts`, `tests/e2e/database-management.spec.ts`; modify authorization, Navbar and deployment documentation. Large maintenance/backup jobs run through an explicit bounded worker/operator mechanism, not an unbounded web request. Backup/restore remains an operator procedure initially; UI reports recovery status and instructions, not a server filesystem upload/restore console.

**Interfaces:**
- `getDatabaseStatus(actor: Session): Promise<DatabaseStatus>` exposes sanitized metadata and explicit capabilities.
- `listOwnedRecords(actor: Session, filter: OwnedRecordFilter, page: {limit: number; cursor?: string}): Promise<OwnedRecordPage>` is parameterized and bounded; field and sort allowlists only.
- `previewMaintenance(actor: Session, request: MaintenanceRequest): Promise<MaintenancePlan>` includes operation, owned resource, matchedCount, dependencyCount, expiry and recoveryRequired.
- `executeMaintenance(actor: Session, planId: string, confirmation: string, idempotencyKey: string): Promise<MaintenanceJob>` verifies current authorization, reauthentication, origin, ownership and immutable plan scope server-side. Never accepts raw SQL, table identifiers, DSNs or arbitrary backup paths from the client.

**TDD/acceptance:**
- [ ] RED -> GREEN: unauthenticated requests return 401, analysts/insufficient permission return 403, revoked/replayed/expired plans are rejected; direct API requests cannot bypass UI restrictions.
- [ ] RED -> GREEN: safe metadata reveals no DSN/secret/raw-log values; browse pagination/filters are bounded and do not include records outside the approved resource/scope.
- [ ] RED -> GREEN: preview performs zero target/reputation-data mutation while persisting its durable immutable control-plane plan; invalidation preserves identity/events; selected owned reputation deletion affects exactly previewed targets and preserves unrelated data, auth records and audit history.
- [ ] RED -> GREEN: shared or unverified tables, indicator rows referenced by events, injected resource/sort parameters, arbitrary SQL and unsupported DDL actions are rejected. Synthetic integration proves related event rows are unchanged despite legacy cascade constraints.
- [ ] RED -> GREEN: expired preview, changed scope, concurrent edits, missing recovery checkpoint, missing reauthentication and untrusted origin fail safely; duplicate execute calls do not repeat deletions.
- [ ] RED -> GREEN: retention disabled by default; enabled policy touches only owned expired reputation within the approved boundary; job cancellation/partial failure accurately reports committed counts and audit outcome.
- [ ] E2E on both DB deployment paths: admin status -> filter/browse -> preview -> confirm -> execute -> read-back technical counts/audit; analyst denial; restart preserves job/retention configuration. Test recovery on synthetic data before enabling bulk deletion.

### Revised Task Dependencies and Release Gate

- Task 1 remains first: publication/secret/build safety.
- Implement Task 3 database/auth-storage foundation before completing Task 2 first-run administrator lifecycle; session security and bootstrap are reviewed together.
- Apply revision A as the unified-workbench vertical slice alongside Task 4; do not maintain two separate investigation UIs.
- Task 5 metrics and Task 6 feeds preserve this shared input/result contract.
- Apply revision D navigation cleanup with the unified workbench; remove only the duplicate home link, not home functionality or Analytics.
- Implement revision E in separately reviewable vertical slices after Tasks 2–3: metadata/authorized browsing first, scoped invalidation/selected cleanup second, retention jobs third. Destructive slices stay disabled until ownership, dependency protection, recovery and audit tests pass.
- Task 7 must verify both PostgreSQL paths, the full first-run setup journey, revised navigation and admin database-management seams, and remove every shipped demo credential.
- Extend session permissions with `database:read` and `database:manage`; enforce them server-side and provision an optional narrowly scoped maintenance role rather than broadening existing runtime roles.
- These are additions to the release gate, not implemented capabilities. Owner review is required before code changes.

## Global Constraints

- Review/planning is the currently authorized scope. This file is not authorization to implement, rotate keys, rewrite history, push or deploy.
- No production DB rows, raw alerts, logs, SQL dumps or env values may be read or sent to external agents. Synthetic fixture data only.
- Preserve user changes in `scripts/upsert_user_ips.js` and its backup; no stash/reset/automatic commits of unrelated work.
- Read installed Next.js guides before code changes. Load TDD and review skills; RED -> GREEN -> refactor per vertical behavior.
- No destructive schema replacement. Isolated test database for integration; production migration and rollback require approved execution scope.
- No implicit secondary DB writes, demo credentials in production, or undeclared provider requests.
- Keep current triage/evidence visibility. New aggregate panels must not displace or hide event drill-down.
- License choice, clean-publication/history strategy and public deployment exposure need owner approval. Proposed default is internal self-hosted hardened release first, not anonymous internet access.

## Review Focus

1. Forged/expired/revoked sessions and direct handler access must fail closed (Task 2).
2. Non-global/mapped IPv6 and provider failure must never leak indicators or manufacture successful writes (Task 4).
3. Critical evidence outside the first page and boundary timestamps must not change meaning with pagination (Task 5).
4. Zero alerts, missing reputation and stale cache must remain distinct (Tasks 4–5).
5. Clean-clone installation, unsafe seed target and partial migration failure must have deterministic recovery (Tasks 1, 3, 7).

## File/Module Map

Keep current pages/routes. Proposed new modules:
- `lib/config.ts`: validated runtime configuration without secret defaults.
- `lib/auth.ts` + `lib/authorization.ts`: session verification and request authorization.
- `lib/reputation-repository.ts`: explicitly configured writer; no implicit sync.
- `lib/provider-client.ts`: bounded provider egress and validated provider results.
- `lib/telemetry-aggregates.ts`: scoped aggregates independent of page queries.
- `lib/export.ts`: safe CSV/Markdown/feed serialization.
- `migrations/`: owned schema lifecycle; `tests/integration/`, `tests/e2e/`: synthetic seam coverage.

Exact signatures below are proposed contracts, not claims that these interfaces already exist. Resolve any schema compatibility conflict before implementation, without silently converting missing observations into real telemetry.

### Task 1: Safe publication/build boundary (F02, F03, F08)

**Files:** Modify `.gitignore`, `.dockerignore`, `Dockerfile`, `app/api/enrich/route.ts:8-10`, `lib/db.ts:697-706`; create tracked `.env.example`, `tests/release-boundary.test.ts`, `scripts/check-release-boundary.mjs`.

**Interfaces:** Runtime secrets via `ABUSEIPDB_API_KEY`; `assertReleaseBoundary(root: string): Promise<void>` exits nonzero on forbidden release files or secret literals. Never print matching values.

- [ ] Owner revokes/rotates embedded provider key; record completion without recording its value. Agree sanitized new publication history versus coordinated rewrite; do not alter existing history unilaterally.
- [ ] RED: `release_boundary_rejects_env_dump_backup_and_secret_literal` uses synthetic markers and asserts rejection with redacted file/line metadata; current build exclusions should fail marker exclusion.
- [ ] GREEN: remove embedded secret/machine configuration, explicitly allow `.env.example` in Git and exclude real env/dumps/backups from Docker; narrow COPY inputs.
- [ ] Verify sanitized context, builder/cache, final image and client bundle contain no synthetic markers; run complete intended-history secret scan locally with value redaction. Do not declare rotation from a code diff alone.
- [ ] Review changes and commit only task-owned files after approval.

### Task 2: Real authentication and authorization (F01)

**Files:** Modify `lib/auth.ts`, `proxy.ts`, auth routes, sensitive API handlers, `app/login/page.tsx`; create `lib/authorization.ts`, `tests/auth.test.ts`, `tests/integration/auth-http.test.ts`.

**Interfaces:** `requireSession(request: Request): Promise<Session>` returns verified `{userId: string, role: 'analyst' | 'admin', expiresAt: number}` or a uniform 401. `requirePermission(session: Session, action: 'read' | 'enrich' | 'export'): void` denies unauthorized action with 403. Choose a maintained compatible session library before implementation; no custom unsigned encoding.

- [ ] RED: cookie absent/empty/random/tampered/expired/revoked returns 401 both through proxy and direct handler; valid identity without permission returns 403.
- [ ] GREEN: verified server-side session lifecycle and authorization plus revision B first-run bootstrap; an uninitialized installation permits only authorized setup, never normal login. Remove all demo credential fallbacks, quick-fill and default disclosures from the shipped flow; never substitute default credentials when configuration or DB is unavailable.
- [ ] RED -> GREEN: `/login?from=https://example.invalid` cannot navigate externally; valid local path retained; login attempts throttled under trusted ingress identity.
- [ ] Verify login/logout/revocation over synthetic HTTP, secure cookie flags under trusted HTTPS and explicit local development behavior; no credential values in logs.
- [ ] Spec review, quality review, task-scoped commit.

### Task 3: Owned schema, demo and least-privilege boundaries (F04, F08)

**Files:** Create `migrations/001_initial.sql` and follow-up compatible migration(s), `lib/config.ts`, `lib/reputation-repository.ts`, integration DB setup; modify `lib/db.ts`, `docker-compose.yml`, `scripts/seed-mock.ts`, `docs/DB_SCHEMA.md`.

**Interfaces:** `readTelemetry<T>(sql: string, params: unknown[]): Promise<T[]>`; `saveReputation(input: ReputationWrite): Promise<void>` uses a separate configured writer with no hidden mirror. Define `ReputationWrite` alongside repository with normalized IP, source, score, checkedAt and provider metadata; exclude observed-event fields.

- [ ] RED: fresh synthetic DB can migrate; migration replay is safe; telemetry role cannot INSERT/UPDATE/DELETE/DDL; enrichment writer cannot change events; absent writer configuration fails persistence explicitly.
- [ ] GREEN: self-contained schema and separate privileges, explicit optional writer DSN, no hostname-substring sync behavior; remove sibling-folder schema dependency.
- [ ] RED -> GREEN: seed refuses non-development target, never prints DSN, and repeated execution does not duplicate events or replace operational records.
- [ ] Verify clean synthetic Compose boot and migration failure/recovery; capture only schema/technical aggregates. Coordinate schema changes with Arbiter's shared readers before production rollout.
- [ ] Spec review, quality review, task-scoped commit.

### Task 4: Safe enrichment, validation and freshness (F06–F09)

**Files:** Modify IP validator, enrich/bulk routes and enrich page; create provider client and validation tests.

**Interfaces:** `normalizeIp(input: string): string`; `isGlobalIp(ip: string): boolean`; `lookupReputation(ip: string, signal?: AbortSignal): Promise<ProviderResult>`; `isReputationFresh(checkedAt: string | null, now: Date, ttlHours: number): boolean`. Use proposed default TTL 168 hours consistently, configurable and documented. ProviderResult must distinguish known score zero, missing score, rate limit and provider failure.

- [ ] RED: non-string members/malformed JSON => 400, oversized payload => 413, no silent batch truncation; malformed CIDR rejected and exact-IP route rejects all CIDR until subnet search is separately specified.
- [ ] RED -> GREEN: ULA/link-local/CGNAT/mapped-private, multicast, unspecified and other configured non-global ranges never cause provider requests. Tests use synthetic intercepted HTTP, not the real API.
- [ ] RED -> GREEN: fresh cache hit avoids provider, stale cache refresh follows explicit egress policy; disabled enrichment causes no egress. Timeout/429/malformed response yields bounded failure and no false persistence success.
- [ ] Preserve `savedToDb=false` on write failure; separate indicator creation/reputation check time from observation times. Local/private classification must not imply whitelisted or safe.
- [ ] Verify UI -> schema -> provider fixture -> isolated writer -> response -> render, including cancellation and partial batch failure. Spec/quality reviews and scoped commit.

### Task 5: Truthful scoped metrics and scoring (F05, F06, F10)

**Files:** Create `lib/telemetry-aggregates.ts`, `app/api/ip/[ip]/summary/route.ts`, metric contract tests; modify detail/dashboard routes/pages, scoring, timeline and mock repository behavior.

**Interfaces:** `TelemetryScope = {from: string; to: string; alertType?: string; outcome?: string; targetHost?: string}` with UTC half-open `[from,to)` boundaries. `getIpSummary(ip: string, scope: TelemetryScope): Promise<{eventCount: number; outcomes: {outcome: string; count: number}[]; timeline: {date: string; count: number}[]; hasCriticalOutcome: boolean}>`. `calculateVerdictScore(input: ScoreInput, now?: Date): ScoreBreakdown` preserves zero/unknown semantics. Share score-context assembly across routes or visibly label reputation-only results.

- [ ] RED: synthetic fixture with more than 50 events and an older critical event; switching 15-row pages must not alter summary/timeline/verdict for the same scope. A negative host/outcome/time fixture must be excluded from both count and rows.
- [ ] GREEN: SQL aggregates independent of pagination; explicit scope labels and UTC boundaries; critical detection over selected scope, not first 50 rows.
- [ ] RED -> GREEN: zero telemetry adds zero volume/spread, reputation-only records do not appear as observed attacks; missing versus zero source values remain distinct; injected time makes recency deterministic.
- [ ] RED -> GREEN: dashboard filter applies uniformly or cards explicitly label all-time scope; mock and SQL implementations agree on time, VT blocklist criteria and response fields.
- [ ] Browser test verifies evidence table stays visible/usable, page resets when filters change, errors are not mislabeled as no telemetry, and summary totals match synthetic SQL aggregates. Spec/quality reviews and scoped commit.

### Task 6: Feeds, exports and abuse controls (F09)

**Files:** Create `lib/export.ts`, export/rate-limit/HTTP tests; modify provider roster/detail/export and blocklist routes, provider page and rate limiter.

**Interfaces:** `encodeCsvCell(value: unknown): string` handles RFC quoting and spreadsheet formula safety; `getProviderIps(name: string, limit: number, offset: number)` returns bounded `{items, total}`; machine feed authorization uses scoped, expiring/revocable token with `feed:read`, never an interactive session workaround.

- [ ] RED -> GREEN: unknown formats, NaN/negative/out-of-range numeric parameters and excessive body/roster sizes have documented client errors or explicit bounds; no silent incomplete export.
- [ ] RED -> GREEN: CSV quotes/CRLF/formula prefixes and Markdown pipes cannot alter document structure; feeds cannot inject extra lines. Define IPv6 CDB behavior against actual Wazuh consumer support before enabling it.
- [ ] RED -> GREEN: arbitrary forwarded headers cannot reset limits under documented trusted proxy policy; expired identifiers evict and memory is bounded; distributed limiter required only when deploying multiple instances.
- [ ] Verify valid machine feed token succeeds and missing/wrong-scope/revoked token fails, large synthetic roster paginates, exports use bounded streaming or explicit limits.
- [ ] Spec/quality reviews and scoped commit.

### Task 7: Quality, operations and release proof (F10, F11)

**Files:** Create `.github/workflows/ci.yml`, health/readiness routes, Playwright config, E2E tests, `SECURITY.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, deployment/recovery docs; modify README, package scripts and container configuration. Add LICENSE only after owner's choice.

**Interfaces:** `/api/health` exposes minimal liveness; `/api/ready` returns 200 only for ready dependencies and 503 otherwise without DSN, records or topology disclosure. CI uses synthetic service DB and no production credentials.

- [ ] RED -> GREEN: current lint findings fixed narrowly without blanket disabling rules; quality commands run on the chosen supported Node runtime matching the container.
- [ ] CI runs `pnpm install --frozen-lockfile`, `pnpm test` with explicit synthetic setup, `pnpm lint`, `pnpm exec tsc --noEmit`, default `pnpm build`, isolated PostgreSQL integration and browser E2E; no production DB/egress access.
- [ ] Verify documented clean-clone quickstart, default Docker build, negative readiness when DB unavailable, scoped auth, lookup/bulk/provider/filter/export/enrich fixture seams, restart persistence and rollback/restore against synthetic DB.
- [ ] Run secret history/artifact scans and current dependency/image advisory scans locally; distinguish vulnerabilities from unverified warnings. Store redacted results.
- [ ] Document TLS, bind/firewall/proxy trust, backup retention, restore command, migration rollback, service SLO/load-test workload and egress policy. Choose workload targets before claiming performance readiness.
- [ ] Replace inaccurate read-only, test-count, default credential and blanket XSS claims; use synthetic screenshots and neutral configurable branding.
- [ ] Independent whole-project review: privacy/public-source gate first; functional/internal-hardening gate second; public deployment gate last. Commit/tag/push only when authorized.

## Final Acceptance Matrix

- Public source: known key rotated; intended full history and artifacts secret-scanned; no private fixture/dump/env data; approved license/publication strategy; truthful reproducible docs.
- Internal release: real auth; explicit writer/egress; aggregate correctness; synthetic full seams; quality gates green.
- External deployment: controlled ingress/TLS; authorization/abuse controls; scoped machine feeds; readiness/monitoring; recovery/load evidence; no unresolved P0/P1 findings.

## Handoff

Recommended execution is subagent-driven with privacy-sanitized context and two-stage reviews per task. Parent agent performs any sensitive local inspection within workspace restrictions. Stop before implementation until owner reviews this plan; no public push or deployment is implied by approval of a code task.
