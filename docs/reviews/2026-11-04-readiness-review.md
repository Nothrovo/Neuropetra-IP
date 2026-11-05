# IP Intel — GitHub & Deployment Readiness Review

Date: 2026-11-04
Scope: local source/configuration/Git metadata review, synthetic tests and narrow live invalid-input probe. Review and planning only; no production implementation, deployment, push, credential rotation or history rewrite performed.

## Verdict

**NO-GO for public publication and public deployment in current state.** A useful internal prototype exists, but authentication, secret hygiene, reproducibility and telemetry semantics need release gates. This is not a claim of a completed penetration test or confirmed compromise.

## Privacy and evidence limits

- No database connections, row reads, raw alert reads or production exports were performed.
- SQL dump contents and environment-file values were not inspected. Their presence was discovered by filename only.
- An independent reviewer received sanitized architecture facts only, without secrets, records, logs or repository access.
- The live probe used `/api/ip/not-an-ip`, stopping at validation before repository access; no successful data lookup was attempted.
- Existing changes to `scripts/upsert_user_ips.js` and untracked `.bak` were left untouched. The script received only local boolean risk inspection, not record/payload extraction.
- Do not include secrets, internal IPs, dumps, telemetry screenshots or raw probe logs in the public release.

## Architecture as implemented

Next.js App Router / React Query pages -> Next route handlers -> `lib/db.ts` -> PostgreSQL cache/events. `lib/scoring.ts` supplies composite verdicts; mock data supports isolated operation. Enrichment calls AbuseIPDB and upserts cache reputation through a direct pool client, bypassing the read-query wrapper. An implicit secondary local-database sync also exists. Docker builds a standalone Next server; Compose uses host networking and an optional development PostgreSQL service.

## Existing strengths

- Lookup, bulk investigation, provider pivoting, exports and event drill-down form a useful SOC workflow.
- Query values in inspected repository methods are parameterized.
- Event pagination and plain-text display are useful foundations; this is not proof of blanket XSS immunity.
- Shared score breakdown, mock repository support, lockfile and non-root image runner already exist.
- Unit suite and type checking pass under the conditions below.

## Verified baseline

| Check | Observed result | Scope |
|---|---|---|
| `USE_MOCK_DATA=true pnpm test` | 6 files, 41 tests passed | Synthetic/mock only |
| `pnpm exec tsc --noEmit --incremental false` | Exit 0 | Current workspace |
| `pnpm lint` | Exit 1; 53 errors, 57 warnings | Includes `any`, unused declarations, prefer-const and render-purity issues |
| `pnpm exec next build --webpack` | Exit 0 | Isolated scratch copy, mock mode, no env/dumps, existing installed modules; scripts omitted |
| Live invalid lookup, no cookie | HTTP 401 | Running local container |
| Same invalid lookup, arbitrary nonempty cookie | HTTP 400 | Passed auth gate into input validation; no DB access |
| Direct current-source proxy probe | Missing cookie 401; forged cookie passes | Synthetic NextRequest |
| Isolated production server, unknown synthetic bulk indicator | HTTP 200, requested 1, found 0 | Mock mode |
| Isolated production server, non-string bulk/enrich array members | Both HTTP 500 | Invalid input should be client error |
| Isolated production server, private-address enrichment | HTTP 200, status private | Cache bypassed; no provider request needed |
| Isolated production server, dashboard | HTTP 200, timeline array | Mock mode only |
| Synthetic helper probes | Non-public ranges misclassified; malformed CIDR accepted; zero telemetry creates local signal | See findings |

The isolated server was stopped after testing. The running production container was not restarted or modified. Default Turbopack build, clean dependency installation, Docker build, real DB integration, complete browser E2E, vulnerability-advisory audit, performance and recovery tests remain unverified. Host Node observed was v26.12.1; Dockerfile targets Node 22, so host success does not establish container parity.

## Findings

### F01 — P0: Authentication is forgeable

Evidence: `proxy.ts` authorizes any nonempty `soc_session`; `lib/auth.ts:10-25` decodes/creates unsigned base64 JSON. `app/api/auth/login/route.ts:9-10,35` has fallback credentials and discloses the demo pair on failure. No expiry validation is present in the session helper; browser cookie max-age is not server-side token expiry. Live invalid-input probe confirms the active gate is bypassable.

Fix: verified, expiring sessions with server-side authorization at sensitive handlers/data access, revocation policy, safe local redirects and production credential requirements. Add login throttling and explicit HTTPS/proxy trust policy. `app/login/page.tsx:10,35` accepts an unchecked `from` destination; constrain to local application paths.

### F02 — P0: Embedded provider secret exists in tracked source and history

Evidence: `app/api/enrich/route.ts:8-10` contains a literal fallback API key. A local redacted scan found the literal in commits `f3d50b5ba6b3` and `557e13614c2b`. Its validity was not tested and it was not sent to the provider.

Fix: revoke/rotate through the owner, remove fallback, use runtime secrets, scan complete Git history and release artifacts with redaction. Removing the latest literal alone does not sanitize history. Coordinate a clean publication history or approved rewrite; do not rewrite automatically. Local-sync connection configuration is also embedded at `lib/db.ts:697-706`; remove machine-specific configuration and assess credentials locally without publishing them.

### F03 — P0: Unsafe Docker build context

Evidence: `.dockerignore` excludes only node_modules, .next, .git and logs; Dockerfile builder uses `COPY . .`. Workspace contains ignored env files and SQL dumps. Git ignore does not protect Docker context. No image-layer inspection was performed; inclusion in final image or registry is NOT established.

Fix: exclude env/dumps/backups/private artifacts, narrow copied files, build from sanitized checkout, test marker exclusion from context, builder/cache, standalone output and client bundle. Audit existing build artifacts separately before publishing them.

### F04 — P1: Read-only promise conflicts with actual write topology

Evidence: README instructs a read-only role; `lib/db.ts:754-800` writes cache via direct clients and conditionally mirrors to another local DB by hostname-substring detection. Compose falls back to a postgres-role URL. Actual DB privileges were not queried.

Fix: explicit read-only telemetry connection and separate narrowly privileged reputation writer/storage. No implicit mirror writes. Missing writer configuration must disable persistence clearly. Document mutation boundaries and isolate test DB. SQL-prefix checks accepting SELECT/WITH are not a security boundary; enforce privileges in PostgreSQL.

### F05 — P1: Timeline/outcomes and verdicts have inconsistent scopes

Evidence: `app/ip/[ip]/page.tsx:63-68,128-137,336` fetches 15 paginated events, derives outcome counts from those events and passes them into timeline. Moving pages therefore changes the apparent historical summary. `app/api/ip/[ip]/route.ts:38-40` detects critical outcomes from only the latest 50 events; bulk/enrich scoring paths do not supply the same critical-outcome input.

Fix: independent aggregate endpoints over an explicit time/filter scope; page only evidence rows. Adopt one score-context contract across lookup/bulk/enrich or explicitly label limited reputation-only results. Use EXISTS/aggregate critical detection over the chosen scope, not arbitrary top-N.

### F06 — P1: Enrichment manufactures telemetry context and ignores cache expiry

Evidence: `lib/db.ts:729-746,754-760` creates reputation-only records with current first/last-seen and zero alerts. `app/api/bulk/route.ts:82` changes zero alert count to one with `|| 1`. `lib/scoring.ts:75-82` similarly defaults zero alerts/targets to one; synthetic zero-alert probe produced nonzero volume and target-spread contributions. `app/api/enrich/route.ts:83-121` accepts cached reputation without TTL enforcement, while IP detail labels reputation expired after seven days.

Fix: separate reputation checked/indicator-created timestamps from observed telemetry timestamps. Never infer a local event from an external lookup. Preserve zero versus unknown. Share TTL policy and inject scoring clock for deterministic tests. Do not describe a zero external reputation score as proof of cleanliness.

### F07 — P1: Non-public address/egress policy is incomplete

Evidence: `lib/ip-validator.ts:87-90` misses IPv6 ULA, IPv4 link-local, shared CGNAT and mapped-private IPv6. Synthetic probes returned false for `fc00::1`, `fd00::1`, `169.254.1.1`, `100.64.0.1` and `::ffff:192.168.1.1`. `isValidCIDR` accepts a trailing-garbage prefix via parseInt. The enrich path can submit these misclassified indicators to a third party; no such requests were made in this review.

Fix: maintained address parser, normalized representation and documented non-global deny policy; explicit external-enrichment enablement. Private address means local/unknown reputation, not necessarily low threat or whitelisted. Document provider egress and implement timeout, cancellation, response schema validation, bounded retries/quota handling.

### F08 — P1: Fresh checkout is not self-contained

Evidence: Compose dev DB mounts `../Alpha_Reporter/schema_abuseip.sql`; target is absent. `.env.example` exists locally but is not tracked because `.env*` ignores it. No versioned migrations directory exists. Seed script prints the full connection string and defaults toward a non-isolated database; repeated seeds append events without an isolation/idempotency guard.

Fix: tracked secret-free env template, owned migrations and explicit dedicated development/test DB with fail-closed seed guard. One documented command should start a synthetic demo from a clean checkout without Arbiter/Reporter folders or operational data.

### F09 — P1/P2: Validation, rate limits and export scalability need hardening

Evidence: array members are treated as strings without runtime validation; isolated HTTP probes yield 500 for wrong types. Numeric query inputs use unconstrained parseInt. `lib/rate-limit.ts` stores identifiers in an unbounded process-local Map; routes trust caller-supplied x-forwarded-for. `getProviderDetail` returns an unpaginated roster, also used for exports. CSV route interpolation does not centrally escape quotes/newlines or neutralize formula cells. Feed endpoints require an interactive cookie rather than scoped machine credentials. Invalid CIDR can pass validation while repository performs exact-text IP equality, not subnet search.

Fix: schema-based inputs and size/row bounds; trusted-proxy client identity, TTL/eviction and shared limits when scaling; roster pagination and bounded/streamed exports; shared CSV/Markdown serializers; scoped revocable feed token. Reject CIDR on exact lookup until a properly scoped subnet endpoint is designed.

### F10 — P2: Dashboard filters and mock/DB semantics diverge

Evidence: `lib/db.ts:364-399` applies days only to timeline, not country/type/MITRE/outcome queries. Mock events ignore days; mock blocklist ignores maxAgeDays and differs from SQL VT inclusion. Dashboard mock contains ASN ranking absent from DB response. README claims 14 tests but actual suite has 41, describes uniform read-only behavior, and makes an unsubstantiated zero-XSS claim.

Fix: explicit scope labels or uniformly applied filters, contract parity tests, documented count units (IPs versus events) and freshness, realistic synthetic fixtures, accurate docs.

### F11 — P2: Release engineering and operations are incomplete

Evidence: no .github workflows, LICENSE, SECURITY.md, CONTRIBUTING.md or CHANGELOG.md found; lint is failing. Running container has host networking and no configured container healthcheck. No dedicated health/readiness endpoint appears in route inventory. Dependency advisories, backup/restore and performance were not assessed.

Fix: CI unit/type/lint/build, isolated PostgreSQL integration, browser E2E, secret/dependency/image checks, release versioning and owner-selected license. Add health/readiness, sanitized operational metrics, explicit network binding/TLS policy, rollback and recovery runbooks. Avoid unnecessary microservices or a framework rewrite.

## Release boundaries

1. **Public source gate:** rotate known provider secret, sanitize complete intended history/artifacts, remove private/machine-specific data, scan fixtures/scripts, choose license and ship truthful setup/security docs. An unfinished project may be published as explicitly experimental only after this privacy gate.
2. **Internal hardened release:** verified authentication, explicit write/egress boundaries, correct aggregates, safe demo and passing quality/integration gates.
3. **Public deployment gate:** all previous gates plus trusted ingress/TLS, abuse controls, feed authorization, operational monitoring, recovery and realistic load tests.

## Target product direction

Keep a modular Next.js monolith and PostgreSQL. Position IP Intel as a self-hosted IP reputation and local telemetry investigation workbench; Arbiter remains alert triage. Share documented interfaces, not another project's paths, databases or credentials by accident. Preserve event drill-down and existing workflows while improving integrity. No decorative replacement dashboard.

Detailed implementation sequence: `../superpowers/plans/2026-11-04-ip-intel-product-readiness.md`.
