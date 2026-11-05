# Graph Report - ip-intel-implementation  (2026-11-05)

## Corpus Check
- 157 files · ~61,733 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 3, .example 1, .ico 1)

## Summary
- 775 nodes · 2056 edges · 35 communities (27 shown, 8 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 30 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7b0955bf`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- auth.ts
- investigation-state.ts
- enrich/route.ts
- database-management.ts
- ref_node_fs
- db-pool.ts
- operator-database.test.ts
- Operations runbook
- File/Module Map
- Findings
- compilerOptions
- package.json
- devDependencies
- dependencies
- ref_node_path
- scripts
- ip-validator.ts
- release-boundary.ts
- eslint.config.mjs
- AGENTS.md
- postcss.config.mjs
- maintenance-postgres.test.ts
- vitest
- Scoped database maintenance handoff
- playwright.config.ts
- auth-live.test.ts
- db.ts
- Implementation verification progress
- 003_maintenance.sql
- 002_auth.sql
- 001_initial.sql
- 004_feed_tokens.sql
- DatabasePage
- Backend implementation handoff

## God Nodes (most connected - your core abstractions)
1. `vitest` - 55 edges
2. `AuthError` - 30 edges
3. `react` - 27 edges
4. `normalizeIp()` - 26 edges
5. `apiError()` - 23 edges
6. `withApiPermission()` - 23 edges
7. `getAuthPool()` - 23 edges
8. `checkRateLimit` - 23 edges
9. `ApiInputError` - 21 edges
10. `maintenanceRepository` - 21 edges

## Surprising Connections (you probably didn't know these)
- `Interfaces and configuration` --references--> `withApiPermission()`  [INFERRED]
  docs/maintenance-handoff.md → lib/authorization.ts
- `F09 — P1/P2: Validation, rate limits and export scalability need hardening` --references--> `getProviderDetail()`  [INFERRED]
  docs/reviews/2026-11-04-readiness-review.md → lib/db.ts
- `F07 — P1: Non-public address/egress policy is incomplete` --references--> `isValidCIDR()`  [INFERRED]
  docs/reviews/2026-11-04-readiness-review.md → lib/ip-validator.ts
- ``ip_intel_cache`` --references--> `text()`  [INFERRED]
  docs/DB_SCHEMA.md → app/api/enrich/route.ts
- ``ip_intel_events`` --references--> `text()`  [INFERRED]
  docs/DB_SCHEMA.md → app/api/enrich/route.ts

## Import Cycles
- None detected.

## Communities (35 total, 8 thin omitted)

### Community 0 - "auth.ts"
Cohesion: 0.08
Nodes (57): POST(), POST(), POST(), GET(), GET(), GET(), POST(), AUTH_COOKIE_NAME (+49 more)

### Community 1 - "investigation-state.ts"
Cohesion: 0.08
Nodes (44): Page(), Page(), InvestigatePage(), IndicatorInput(), count, exportInvestigationResults(), exportValue(), externalDisabledReason() (+36 more)

### Community 2 - "enrich/route.ts"
Cohesion: 0.11
Nodes (46): feed(), GET(), interactive, POST, GET, empty(), EnrichedIpResult, POST (+38 more)

### Community 3 - "database-management.ts"
Cohesion: 0.09
Nodes (41): POST, schema, POST, POST, GET, databaseResponse(), GET, requireRecentAuth() (+33 more)

### Community 5 - "db-pool.ts"
Cohesion: 0.15
Nodes (19): GET(), databaseKeys, DatabaseScope, databaseUrl(), getCapabilities(), hasDatabase(), readSecret(), getMaintenancePool() (+11 more)

### Community 7 - "Operations runbook"
Cohesion: 0.04
Nodes (44): text(), Contributing, Engineering workflow, Privacy first, Publication, Authentication and setup, Connection and role split, Database schema and privilege contract (+36 more)

### Community 8 - "File/Module Map"
Cohesion: 0.09
Nodes (22): A. One Investigation Workbench, Explicit Data Modes, B. First-Run Administrator Setup — No Demo Credentials, C. Two Supported PostgreSQL Installation Paths, D. Remove Duplicate Overview Navigation, E1. View Health, Storage and Ownership, E2. Manage Data Without Destroying Shared Telemetry, E3. Destructive Action Workflow, E. Administrator Database Management — Scoped and Auditable (+14 more)

### Community 9 - "Findings"
Cohesion: 0.10
Nodes (20): Architecture as implemented, Existing strengths, F01 — P0: Authentication is forgeable, F02 — P0: Embedded provider secret exists in tracked source and history, F03 — P0: Unsafe Docker build context, F04 — P1: Read-only promise conflicts with actual write topology, F05 — P1: Timeline/outcomes and verdicts have inconsistent scopes, F06 — P1: Enrichment manufactures telemetry context and ignores cache expiry (+12 more)

### Community 10 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 11 - "package.json"
Cohesion: 0.12
Nodes (15): name, packageManager, private, version, clsx, ipaddr.js, tailwind-merge, tailwindcss (+7 more)

### Community 12 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, eslint, eslint-config-next, @playwright/test, tailwindcss, @tailwindcss/postcss, tsx, @types/node (+5 more)

### Community 13 - "dependencies"
Cohesion: 0.17
Nodes (12): dependencies, clsx, ipaddr.js, lucide-react, next, pg, react, react-dom (+4 more)

### Community 15 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, account, build, db:migrate, db:provision, dev, install:secrets, lint (+3 more)

### Community 16 - "ip-validator.ts"
Cohesion: 0.05
Nodes (57): BlocklistPage(), DashboardPage(), DashboardResponse, metadata, RootLayout(), HomePage(), handleSearch(), StatsResponse (+49 more)

### Community 17 - "release-boundary.ts"
Cohesion: 0.31
Nodes (7): approved(), assertDockerBoundary(), assertReleaseBoundary(), rootFiles, scripts, syntheticCredentialFixtures, main()

### Community 18 - "eslint.config.mjs"
Cohesion: 0.50
Nodes (3): eslintConfig, eslint, eslint-config-next

### Community 22 - "maintenance-postgres.test.ts"
Cohesion: 0.18
Nodes (9): actor, execFileAsync, pool, raceAtPlan(), read, repo, reputation, waitForBlockedMaintenance() (+1 more)

### Community 23 - "vitest"
Cohesion: 0.20
Nodes (3): vitest, fixture(), harness

### Community 24 - "Scoped database maintenance handoff"
Cohesion: 0.40
Nodes (4): Interfaces and configuration, Retention scope and worker, Scoped database maintenance handoff, Verification

### Community 25 - "playwright.config.ts"
Cohesion: 0.20
Nodes (6): secretDirectory, statePath, target, @playwright/test, Safety, test

### Community 27 - "db.ts"
Cohesion: 0.07
Nodes (49): GET, DetailResponse, IpDetailPage(), SummaryResponse, AttackTimeline(), EventsTable(), getOutcomeBadge(), OutcomePanel() (+41 more)

### Community 28 - "Implementation verification progress"
Cohesion: 0.13
Nodes (14): Actual bundled Docker verification, Additional parent verification after build notification, Implementation verification progress, Independent backend spec review — FAIL, remediation in progress, Independent Investigate spec review — FAIL, remediation in progress, Independent release spec review — FAIL, remediation in progress, Independently provisioned PostgreSQL server / app-only path, Latest combined default gates and maintenance/documentation handoff (+6 more)

### Community 29 - "003_maintenance.sql"
Cohesion: 0.31
Nodes (9): ip_intel_maintenance_immutable_plan, ip_intel_reputation_revision_insert, ip_intel_reputation_revision_update, public.ip_intel_maintenance_audit, public.ip_intel_maintenance_immutable_plan(), public.ip_intel_maintenance_jobs, public.ip_intel_maintenance_plans, public.ip_intel_reputation_revision() (+1 more)

### Community 30 - "002_auth.sql"
Cohesion: 0.47
Nodes (5): ip_intel_auth_attempts, ip_intel_installation, ip_intel_sessions, ip_intel_sessions_user_idx, ip_intel_users

### Community 31 - "001_initial.sql"
Cohesion: 0.50
Nodes (4): ip_intel_cache, ip_intel_events, ip_intel_reputation, ip_intel_schema_migrations

### Community 33 - "DatabasePage"
Cohesion: 0.15
Nodes (9): LoginPage(), api(), DatabasePage(), browse(), cancel(), execute(), resetPlan(), SetupPage() (+1 more)

### Community 34 - "Backend implementation handoff"
Cohesion: 0.33
Nodes (5): Backend implementation handoff, Follow-up verification commands/results, Integration review follow-up, Safe PostgreSQL integration opt-in, Verification

## Knowledge Gaps
- **10 isolated node(s):** `clsx`, `tailwind-merge`, `@tailwindcss/postcss`, `@types/node`, `@types/pg` (+5 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 303 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `vitest` to `auth.ts`, `DatabasePage`, `enrich/route.ts`, `investigation-state.ts`, `ref_node_fs`, `db-pool.ts`, `database-management.ts`, `operator-database.test.ts`, `package.json`, `ref_node_path`, `ip-validator.ts`, `release-boundary.ts`, `maintenance-postgres.test.ts`, `auth-live.test.ts`, `db.ts`?**
  _High betweenness centrality (0.257) - this node is a cross-community bridge._
- **What connects `clsx`, `tailwind-merge`, `@tailwindcss/postcss` to the rest of the system?**
  _10 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `auth.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08235294117647059 - nodes in this community are weakly interconnected._
- **Why does `text()` connect `Operations runbook` to `enrich/route.ts`?**
  _High betweenness centrality (0.106) - this node is a cross-community bridge._
- **Should `investigation-state.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0777323202805377 - nodes in this community are weakly interconnected._
- **Should `enrich/route.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10616438356164383 - nodes in this community are weakly interconnected._
- **Should `database-management.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09182692307692308 - nodes in this community are weakly interconnected._