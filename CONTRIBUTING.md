# Contributing

## Privacy first

Use synthetic fixture data and an isolated PostgreSQL database. Never connect tests to an operational telemetry database. Do not upload raw alerts, operational IP lists, credentials, database dumps, private scripts or screenshots containing real records. Keep `.env*` and `.secrets/` private; `.env.example` contains names and blank placeholders only.

## Engineering workflow

1. Read repository `AGENTS.md` and the installed Next.js guides relevant to the change.
2. Preserve unrelated local modifications. Define a focused behavior and write a failing test first.
3. Implement the smallest vertical slice, then verify unit, type, lint, integration and browser seams relevant to that slice. Do not add disconnected UI controls.
4. Use parameterized queries and explicit scoped database roles. A string-prefix SELECT guard is not a database security boundary.
5. Preserve zero, unknown, stale reputation and observed telemetry as separate concepts. Summaries must not depend on the current event page.
6. Have spec-compliance and security/quality reviews before merging. Include exact commands and observed results; identify skipped or blocked checks honestly.

Standard checks: `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`. Integration/browser suites require the isolated setup documented in README; do not replace a failing check with mock production output.

## Publication

Do not commit keys, generated secrets, database dumps, backup files, build outputs or local operator utilities containing operational identifiers. Scan the complete intended publication history as well as the working tree. Coordinate secret rotation and history cleanup with the owner. A local review is not permission to push, tag, deploy or run destructive maintenance.

The owner has not selected a redistribution license yet; do not invent licensing permission or copy an unapproved license into the project.
