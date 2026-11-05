# Security policy

IP Intel is self-hosted investigation software, not a guarantee that an indicator is safe or malicious. A zero provider score means no reported abuse in that source, not a safety verdict.

## Deployment boundaries

- Keep the application on loopback or an authenticated private network until TLS, ingress trust, authorization and recovery procedures have been tested.
- Do not publish PostgreSQL directly. Provision distinct migration, authentication, telemetry-reader, reputation-writer and optional maintenance privileges.
- Do not put operational environment files, API keys, database dumps, private scripts or raw telemetry into Git, images, build contexts, screenshots, bug reports or AI prompts.
- External enrichment is optional. Enable it only when authorized to send the selected public indicators to the configured provider. Local lookup must never perform provider requests.
- Initial administrator creation requires an operator-issued, expiring bootstrap token. There are no shipped demo accounts. Keep setup access local/protected and never put the token in a URL.
- Database maintenance is restricted to explicitly owned reputation data. Shared/external telemetry is not a deletion target. Back up and verify recovery before bulk deletion; preview is not a substitute for authorization.

## Reporting vulnerabilities

Do not post credentials, raw alerts, private indicators or exploit traces containing records in public issues. Until the owner establishes a private vulnerability-reporting channel, report only a request for private contact without sensitive details. No monitored email address, response SLA, support commitment or bug-bounty program is claimed by this file.

## Publication blockers inherited from earlier revisions

A provider key was embedded in prior source history. Removing the literal does not revoke that key or sanitize Git history. The owner must rotate/revoke it and approve a clean publication/history strategy before a public release. Existing ignored local backups and database dumps must stay private. Source changes alone do not prove historical images or builder caches are clean.

## Scope of assurances

Tests and release checks cover their documented synthetic fixtures only. Passing them is not a penetration-test certification. Dependency and image advisories must be checked at release time; no blanket XSS immunity or production-readiness guarantee is made.
