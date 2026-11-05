# IP Intel final integration handoff

**Status:** implementation merged into the original worktree and verified locally. This is **not** approval to publish, rotate credentials, rewrite Git history, or deploy production.

## Scope completed

The reviewed sanitized implementation was transferred to the original worktree using an explicit manifest of 160 application-owned files. The transfer included application code, schema migrations, reviewed operator scripts, tests, Compose overlays, CI, and operations documentation.

Excluded from transfer:

- `.env*` values, `.runtime/`, `.secrets/`, database fixtures, dumps, `node_modules/`, `.next/`, and generated runtime state;
- `graphify-out/` generated output from the sanitized workspace;
- temporary verification scripts and generated secrets;
- `scripts/upsert_user_ips.js`, the pre-existing user-owned private script.

Every transferred manifest path was compared byte-for-byte with its sanitized reviewed source after transfer. The original tracked-file fingerprint baseline showed no tracked source changes or missing files before transfer. The user-owned upsert script was explicitly excluded throughout the transfer.

## Final synthetic runtime acceptance

A fresh runner and operator image were built from the final sanitized source. Both supported installation paths passed using generated, restricted local secrets and synthetic PostgreSQL only:

| Check | Bundled Compose PostgreSQL | Separate PostgreSQL server |
|---|---:|---:|
| Compose/config or isolated network setup | pass | pass |
| Health and readiness | 200 | 200 |
| First-admin setup | 201 | 201 |
| Login and authenticated session | 200 | 200 |
| Local bulk lookup | 200 | 200 |
| Session after application restart | 200 | 200 |
| Valid machine feed token | 200 | 200 |
| Revoked machine feed token | 401 | 401 |
| Feed token against general API | 401 | 401 |

The Route B runner was separately checked to ensure it did not receive the privileged provisioning connection. Synthetic containers, networks, generated secret directories, and bundled test volume were removed after acceptance.

## Original-worktree verification

After merge and a frozen lockfile install, the original worktree passed:

- Vitest default suite: **44 files passed, 8 skipped; 295 tests passed, 29 skipped**.
- TypeScript: `tsc --noEmit --incremental false` passed.
- ESLint for reviewed application source passed after excluding two existing legacy/private scripts outside the transfer scope.
- `git diff --check` passed.
- Next.js production build passed.
- Docker runner image build passed as `ip-intel:final-original-acceptance`.
- Graphify was rebuilt in the original worktree.

Skipped suites remain opt-in/live checks and are not counted as default-suite evidence. Separate synthetic PostgreSQL and Chromium maintenance checks were executed before final integration, including ten PostgreSQL maintenance cases and a browser restart/audit case.

## Publication blocker deliberately left unresolved

`node_modules/.bin/tsx scripts/check-release-boundary.ts` currently rejects:

- `scripts/seed-mock.ts`;
- `scripts/upsert_user_ips.js`.

The release scanner identifies credential-shaped content in these legacy/private scripts. They were not altered because they are outside the reviewed product manifest; `scripts/upsert_user_ips.js` is a user-owned change. Do not weaken the allowlist or add broad scanner exemptions merely to make this check green.

Before GitHub publication, the owner must separately decide how to remove, replace, or preserve these scripts without publishing credentials, then rerun the release-boundary check. Credential rotation and Git history sanitation remain mandatory owner decisions where prior secret exposure is possible.

## Explicitly outside this handoff

- Pushing to GitHub, choosing a license, public publication, or creating a release.
- Secret rotation, Git history rewriting/sanitization, and revocation of legacy database/provider access.
- Production deployment, TLS/reverse-proxy configuration, and live provider enablement.
- Reading, importing, modifying, or deleting operational telemetry, alert records, or existing databases.

## Nonblocking follow-ups

- Guard an auth-race integration-test cleanup path when setup fails before its temporary directory is created.
- Add cancellation-route negative API tests for unauthenticated, analyst, cross-origin, stale-reauthentication, and malformed-job requests.
- Pin third-party GitHub Actions to reviewed immutable commit SHAs with documented update procedure.

## Recommendation

Treat the merged application as **integration-verified but publication-blocked** until the two legacy/private scripts are remediated and credential-history decisions are completed. Do not deploy from the current worktree until those owner-controlled publication gates are explicitly resolved.
