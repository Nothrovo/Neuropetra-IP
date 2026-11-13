# Neuropetra Investigation: Universal Clipboard, Auto-Enrichment & Threat Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or native autonomous execution to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore full clipboard copy functionality across HTTP/LAN environments, streamline investigation UX by eliminating manual indicator selection (enriching all submitted indicators directly), and sort investigation outcomes from highest malicious severity down to benign with local/private indicators clearly labelled at the very bottom.

**Architecture:** 
1. Introduce a universal clipboard utility (`lib/clipboard.ts`) with async `navigator.clipboard` and synchronous `document.execCommand('copy')` DOM textarea fallback for non-secure contexts (`http://<LAN-IP>:3000`).
2. Remove pre-submission indicator selection accordion from `InvestigationWorkbench.tsx`, updating the submit action to "Enrich All" (external) / "Search Local" (local) for all valid parsed indicators (`parsed.valid`).
3. Update `investigation-state.ts` to permit non-global indicators through external investigation (leveraging `/api/enrich`'s native `local_private` routing without external quota egress).
4. Implement a deterministic threat ranking engine (`sortInvestigationResults`) that positions high-threat indicators at the top (`Malicious` -> `Suspicious` -> `Low risk` -> `Unknown`) and places all local/private indicators at the bottom with explicit "Local" status badges.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Zod, Tailwind CSS.

---

## Global Constraints
- Security: Never transmit non-global/local IPs to external threat intelligence providers (AbuseIPDB); preserve `/api/enrich`'s existing check that flags non-global IPs as `local_private`.
- Non-destructive UX: Maintain row selection checkboxes in `InvestigationResults.tsx` for selective export scoping (`All results` vs `Selected (N)`).
- Accessibility & Fallbacks: Always gracefully report copy status ("Copied ..." or fallback failure) without unhandled exceptions crashing the React component tree.
- Type Safety: Preserve Zod schemas (`externalOutcome`, `localOutcome`) and strict TypeScript type definitions.

---

## Task Decomposition

### Task 1: Universal Clipboard Copy Utility
**Files:**
- Create: `lib/clipboard.ts`
- Test: `tests/clipboard.test.ts`
- Modify:
  - `components/investigation/InvestigationResults.tsx`
  - `components/DefangButton.tsx`
  - `app/ip/[ip]/page.tsx`
  - `app/providers/[name]/page.tsx`

**Interfaces:**
- Produces: `copyTextToClipboard(text: string): Promise<boolean>`

- [ ] **Step 1: Write failing unit test in `tests/clipboard.test.ts`**
  Assert successful copy via `navigator.clipboard` when available.
  Assert successful copy via `document.execCommand('copy')` fallback when `navigator.clipboard` is undefined or throws.
  Assert false when copying fails in both methods.
- [ ] **Step 2: Run test to verify RED**
- [ ] **Step 3: Implement `copyTextToClipboard` in `lib/clipboard.ts`**
- [ ] **Step 4: Refactor all call sites (`InvestigationResults.tsx`, `DefangButton.tsx`, `app/ip/[ip]/page.tsx`, `app/providers/[name]/page.tsx`) to use `copyTextToClipboard`**
- [ ] **Step 5: Run tests to verify GREEN**

---

### Task 2: Threat Sorting & Local Indicator Labelling Engine
**Files:**
- Modify: `components/investigation/investigation-state.ts`
- Modify: `components/investigation/InvestigationResults.tsx`
- Test: `tests/investigation-sort.test.ts`

**Interfaces:**
- Produces: `isLocalIndicator(row: { ip: string; status?: string; source?: string }): boolean`
- Produces: `sortInvestigationResults(results: InvestigationResult[]): InvestigationResult[]`

**Rules:**
1. Indicators flagged as local (`!isGlobalIp(ip) || status === 'private' || source === 'local_private'`) are sorted to the bottom.
2. Globally routable indicators are ordered:
   - Malicious (`verdict === 'Malicious'`) descending by score (100% -> 75%)
   - Suspicious (`verdict === 'Suspicious'`) descending by score (74% -> 40%)
   - Low risk / Benign (`verdict === 'Low risk'`) descending by score (39% -> 1%)
   - Unknown (`verdict === 'Unknown'`)
3. Secondary tie-breaker: `totalAlertCount` descending, then IP alphanumeric.
4. Local indicators in `InvestigationResults.tsx` render status badge as "Local" with neutral styling, and display a "Local" tag next to the IP.

- [ ] **Step 1: Write failing tests in `tests/investigation-sort.test.ts`**
- [ ] **Step 2: Run test to verify RED**
- [ ] **Step 3: Implement sorting helper in `investigation-state.ts`**
- [ ] **Step 4: Integrate sorting and "Local" badges into `InvestigationResults.tsx` and workbench**
- [ ] **Step 5: Run tests to verify GREEN**

---

### Task 3: Streamline Investigation UX (Remove Indicator Selection & Auto-Enrich All)
**Files:**
- Modify: `components/investigation/InvestigationWorkbench.tsx`
- Modify: `components/investigation/investigation-state.ts`
- Modify: `tests/investigation-ui.test.tsx`
- Modify: `tests/investigation-runner.test.ts`

**Behavior:**
1. In `InvestigationWorkbench.tsx`:
   - Remove `<details className="... Indicator selection: ...">` accordion entirely.
   - Submit button renders "Enrich All" (in external mode) and "Search Local" (in local mode).
   - Button is enabled whenever input has 1-200 valid IPs (no requirement to check individual boxes).
   - Directly submit `parsed.valid` for both local and external investigations.
2. In `investigation-state.ts`:
   - Allow non-global IPs in `runInvestigation` during external mode; `/api/enrich` handles them via `local_private` without external egress.
   - Adjust `tests/investigation-runner.test.ts` and `tests/investigation-ui.test.tsx` to align with the new button labels and non-blocking local submission.

- [ ] **Step 1: Update test assertions in `tests/investigation-ui.test.tsx` & `tests/investigation-runner.test.ts` for "Enrich All" and local inclusion**
- [ ] **Step 2: Verify RED state**
- [ ] **Step 3: Remove accordion and update submission pipeline in `InvestigationWorkbench.tsx` and `investigation-state.ts`**
- [ ] **Step 4: Run test suite to verify GREEN**

---

### Task 4: End-to-End Verification & Quality Audit
- [ ] Run full project test suite (`npm test -- --run`).
- [ ] Verify build passes (`npm run build`).
- [ ] Perform static security scan and code review per `requesting-code-review`.
