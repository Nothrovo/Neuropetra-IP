# Graph Report - ip-intel  (2026-11-05)

## Corpus Check
- 158 files · ~63,894 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 3, .example 1, .ico 1)

## Summary
- 791 nodes · 2071 edges · 33 communities (29 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 30 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ad5c3f3c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- auth.ts
- investigation-state.ts
- db.ts
- database-management.ts
- Operations runbook
- ip-validator.ts
- IP Intel final integration handoff
- Database schema and privilege contract
- File/Module Map
- Findings
- compilerOptions
- package.json
- devDependencies
- dependencies
- Neuropetra IP
- scripts
- [ip]/page.tsx
- README.md
- eslint.config.mjs
- AGENTS.md
- postcss.config.mjs
- Security policy
- vitest
- Scoped database maintenance handoff
- investigation.spec.ts
- Uninstall and data retention
- Implementation verification progress
- 003_maintenance.sql
- 002_auth.sql
- 001_initial.sql
- 004_feed_tokens.sql
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

## Communities (33 total, 4 thin omitted)

### Community 0 - "auth.ts"
Cohesion: 0.06
Nodes (81): POST, schema, POST, POST, databaseResponse(), GET, POST(), POST() (+73 more)

### Community 1 - "investigation-state.ts"
Cohesion: 0.06
Nodes (50): Page(), Page(), InvestigatePage(), metadata, RootLayout(), IndicatorInput(), count, exportInvestigationResults() (+42 more)

### Community 2 - "db.ts"
Cohesion: 0.08
Nodes (69): feed(), GET(), interactive, POST, GET, empty(), EnrichedIpResult, POST (+61 more)

### Community 3 - "database-management.ts"
Cohesion: 0.07
Nodes (46): GET, api(), DatabasePage(), browse(), cancel(), execute(), resetPlan(), assertExecutablePlan() (+38 more)

### Community 4 - "Operations runbook"
Cohesion: 0.15
Nodes (13): Backups, upgrades and recovery, Boundaries and prerequisites, Destructive isolated HTTP/provisioning fixture, Feeds and bounded exports, Host development and optional mock telemetry, Operations runbook, Optional external reputation, Optional maintenance and one-run retention (+5 more)

### Community 5 - "ip-validator.ts"
Cohesion: 0.12
Nodes (32): HomePage(), handleSearch(), ALPHA3_MAP, BulkIpItem, CharlieIocFormatOptions, classifyThreatScore(), formatAlphaIocMarkdown(), formatCharlieIocMarkdown() (+24 more)

### Community 6 - "IP Intel final integration handoff"
Cohesion: 0.22
Nodes (8): Explicitly outside this handoff, Final synthetic runtime acceptance, IP Intel final integration handoff, Nonblocking follow-ups, Original-worktree verification, Publication blocker deliberately left unresolved, Recommendation, Scope completed

### Community 7 - "Database schema and privilege contract"
Cohesion: 0.18
Nodes (13): text(), Authentication and setup, Connection and role split, Database schema and privilege contract, Explicit schema lifecycle, Indexes and performance, `ip_intel_cache`, `ip_intel_events` (+5 more)

### Community 8 - "File/Module Map"
Cohesion: 0.08
Nodes (25): A. One Investigation Workbench, Explicit Data Modes, B. First-Run Administrator Setup — No Demo Credentials, C. Two Supported PostgreSQL Installation Paths, D. Remove Duplicate Overview Navigation, E1. View Health, Storage and Ownership, E2. Manage Data Without Destroying Shared Telemetry, E3. Destructive Action Workflow, E. Administrator Database Management — Scoped and Auditable (+17 more)

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

### Community 14 - "Neuropetra IP"
Cohesion: 0.22
Nodes (9): Architecture and access, Bundled quick start, Configuration, Development and verification, Exports and automation, Installation, Neuropetra IP, Publishing and security (+1 more)

### Community 15 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, account, build, db:migrate, db:provision, dev, install:secrets, lint (+3 more)

### Community 16 - "[ip]/page.tsx"
Cohesion: 0.05
Nodes (46): BlocklistPage(), DashboardPage(), DashboardResponse, DetailResponse, IpDetailPage(), LoginPage(), StatsResponse, EMPTY_IPS (+38 more)

### Community 17 - "README.md"
Cohesion: 0.29
Nodes (4): Contributing, Engineering workflow, Privacy first, Publication

### Community 18 - "eslint.config.mjs"
Cohesion: 0.50
Nodes (3): eslintConfig, eslint, eslint-config-next

### Community 22 - "Security policy"
Cohesion: 0.33
Nodes (5): Deployment boundaries, Publication blockers inherited from earlier revisions, Reporting vulnerabilities, Scope of assurances, Security policy

### Community 23 - "vitest"
Cohesion: 0.05
Nodes (22): approved(), assertDockerBoundary(), assertReleaseBoundary(), rootFiles, scripts, syntheticCredentialFixtures, secretDirectory, statePath (+14 more)

### Community 24 - "Scoped database maintenance handoff"
Cohesion: 0.33
Nodes (5): Additional live coverage: expiry and concurrency, Interfaces and configuration, Retention scope and worker, Scoped database maintenance handoff, Verification

### Community 25 - "investigation.spec.ts"
Cohesion: 0.33
Nodes (3): @playwright/test, Safety, test

### Community 26 - "Uninstall and data retention"
Cohesion: 0.40
Nodes (5): Default: remove the app, keep its data, Retained secrets, artifacts and reinstall, Select the exact installed deployment, Separate opt-in: permanent data destruction, Uninstall and data retention

### Community 28 - "Implementation verification progress"
Cohesion: 0.12
Nodes (15): Actual bundled Docker verification, Additional parent verification after build notification, Implementation verification progress, Independent backend spec review — FAIL, remediation in progress, Independent Investigate spec review — FAIL, remediation in progress, Independent release spec review — FAIL, remediation in progress, Independently provisioned PostgreSQL server / app-only path, Latest combined default gates and maintenance/documentation handoff (+7 more)

### Community 29 - "003_maintenance.sql"
Cohesion: 0.31
Nodes (9): ip_intel_maintenance_immutable_plan, ip_intel_reputation_revision_insert, ip_intel_reputation_revision_update, public.ip_intel_maintenance_audit, public.ip_intel_maintenance_immutable_plan(), public.ip_intel_maintenance_jobs, public.ip_intel_maintenance_plans, public.ip_intel_reputation_revision() (+1 more)

### Community 30 - "002_auth.sql"
Cohesion: 0.47
Nodes (5): ip_intel_auth_attempts, ip_intel_installation, ip_intel_sessions, ip_intel_sessions_user_idx, ip_intel_users

### Community 31 - "001_initial.sql"
Cohesion: 0.50
Nodes (4): ip_intel_cache, ip_intel_events, ip_intel_reputation, ip_intel_schema_migrations

### Community 34 - "Backend implementation handoff"
Cohesion: 0.29
Nodes (6): Backend implementation handoff, Contracts, Follow-up verification commands/results, Integration review follow-up, Safe PostgreSQL integration opt-in, Verification

## Knowledge Gaps
- **10 isolated node(s):** `clsx`, `tailwind-merge`, `@tailwindcss/postcss`, `@types/node`, `@types/pg` (+5 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 316 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `vitest` to `auth.ts`, `investigation-state.ts`, `db.ts`, `database-management.ts`, `ip-validator.ts`, `package.json`, `[ip]/page.tsx`?**
  _High betweenness centrality (0.249) - this node is a cross-community bridge._
- **What connects `clsx`, `tailwind-merge`, `@tailwindcss/postcss` to the rest of the system?**
  _10 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `auth.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05785123966942149 - nodes in this community are weakly interconnected._
- **Why does `text()` connect `Database schema and privilege contract` to `db.ts`?**
  _High betweenness centrality (0.113) - this node is a cross-community bridge._
- **Should `investigation-state.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06479113384484228 - nodes in this community are weakly interconnected._
- **Should `db.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07920792079207921 - nodes in this community are weakly interconnected._
- **Should `database-management.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07010402532790593 - nodes in this community are weakly interconnected._