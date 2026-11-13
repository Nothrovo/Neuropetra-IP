# Neuropetra Benign Verdict & Threat Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or native autonomous execution to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure clean indicators with 0% provider threat scores evaluate as `Low risk` (Benign) with emerald styling rather than `Unknown`, display them as "Benign (0%)" in the Investigation Results table, and synchronize across Local, GitHub, and the remote VM lab.

**Architecture:** 
1. In `lib/scoring.ts`, adjust the classification threshold so that any indicator with valid external reputation or local telemetry (`totalBaseWeight > 0`) and a score below 40% is classified as `Low risk` with `verdictColor: 'emerald'`, reserving `Unknown` solely for unevaluated or data-absent indicators.
2. In `components/investigation/InvestigationResults.tsx`, render `Low risk` verdicts with score 0 as `Benign (0%)` with an emerald badge and checkmark icon, while scores between 1% and 39% render as `Low risk (X%)`.
3. Update unit and integration tests across `tests/scoring.test.ts`, `tests/enrich.test.ts`, and `tests/investigation-ui.test.tsx`.
4. Deploy and verify across all three targets: Local workspace, GitHub remote repository, and the production VM (`10.20.100.117`).

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Docker, Tailwind CSS.

---

## Global Constraints
- Preserve `ThreatVerdict` type enum: `'Malicious' | 'Suspicious' | 'Low risk' | 'Unknown'`.
- Maintain strict non-breaking data contracts for `/api/enrich` and `/api/bulk`.
- Clean indicators with 0% score from providers like AbuseIPDB must never be labeled `Unknown` when valid response data is present.
- Deployment must succeed across all three environments (Local, GitHub, and VM at `10.20.100.117`).

---

## Task Decomposition

### Task 1: Scoring Engine & UI Badge Adjustment
**Files:**
- Modify: `lib/scoring.ts`
- Modify: `components/investigation/InvestigationResults.tsx`
- Test: `tests/scoring.test.ts`
- Test: `tests/enrich.test.ts`
- Test: `tests/investigation-ui.test.tsx`

- [ ] **Step 1: Update unit tests in `tests/scoring.test.ts` and `tests/enrich.test.ts` to expect `Low risk` for 0% abuse score (RED)**
- [ ] **Step 2: Run tests to verify RED**
- [ ] **Step 3: Modify `lib/scoring.ts` to assign `Low risk` (emerald) when `compositeScore < 40` for evaluated indicators**
- [ ] **Step 4: Update `components/investigation/InvestigationResults.tsx` to display `Benign (0%)` for zero scores**
- [ ] **Step 5: Run tests to verify GREEN**

---

### Task 2: Verification, Commit & Three-Target Deployment
- [ ] Run full project test suite (`npm test -- --run`).
- [ ] Run typecheck (`npm run typecheck`) and linter (`npm run lint`).
- [ ] Commit locally with message `fix(scoring): classify 0% threat score as Low risk/Benign instead of Unknown`.
- [ ] Push to GitHub remote (`git push origin main`).
- [ ] Connect to VM (`10.20.100.117`), pull latest changes (`git pull origin main`), and recreate application container.
- [ ] Smoke test remote endpoint (`/api/ready` and HTTP 200/307).
