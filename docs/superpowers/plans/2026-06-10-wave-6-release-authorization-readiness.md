# Wave 6 Release Authorization Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only, redacted release-readiness command that makes the remaining `0.2.8` operator gates explicit without publishing, tagging, uploading, or exposing secrets.

**Architecture:** The readiness command lives in `scripts/release-readiness.cjs` as a CommonJS module with pure helpers exported for tests and a CLI wrapper for operators. It reports only booleans, key names, artifact paths, and status codes; it never prints credential values. Documentation records that Wave 5 completed local release-candidate proof while Wave 6 closes the local release-authorization checklist and keeps operator-only gates separate.

**Tech Stack:** Node.js CommonJS script, Vitest tests through `createRequire`, existing npm script wiring, Markdown release ledgers.

---

## File Structure

- Create `scripts/release-readiness.cjs`
  - Parses `--json` and `--strict`.
  - Reads environment variable presence without printing values.
  - Checks expected local package artifacts.
  - Produces a structured report with `status: "ready" | "blocked"`.
  - Exits nonzero only in `--strict` mode when blocked.
- Create `src/main/release-readiness.test.ts`
  - Imports the CommonJS module through `createRequire`.
  - Tests secret redaction, missing gate classification, ready classification, and strict exit behavior.
- Modify `package.json`
  - Add `release:readiness`.
- Create `docs/WAVE_6_RELEASE_AUTHORIZATION_READINESS.md`
  - Records Wave 6 scope, command, interpreted result, and operator-only gates.
- Modify `docs/WAVE_5_RELEASE_CANDIDATE_SMOKE_PACKAGING.md`
  - Link Wave 6 as the follow-up release-authorization readiness layer.
- Modify `docs/WAVE_3_4_UPSTREAM_PARITY_RELEASE_PREP.md`
  - Refresh upstream state to show `upstream/develop` now has unreleased drift beyond `v0.2.8`.
- Modify `docs/PHASE_10_PARITY_HARDENING_RELEASE_REPORT.md`
  - Link Wave 6 as the newer readiness source.

## Task 1: Readiness Tests

**Files:**
- Create: `src/main/release-readiness.test.ts`
- Later create implementation: `scripts/release-readiness.cjs`

- [ ] **Step 1: Write failing tests**

```ts
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const readiness = require('../../scripts/release-readiness.cjs')

describe('release readiness report', () => {
  it('reports secret key presence without exposing secret values', () => {
    const report = readiness.createReleaseReadinessReport({
      env: {
        CSC_LINK: 'super-secret-cert',
        CSC_KEY_PASSWORD: 'super-secret-password',
        APPLE_API_KEY: '/private/AuthKey_ABC.p8',
        APPLE_API_KEY_ID: 'ABC123',
        APPLE_API_ISSUER: 'issuer-secret',
        R2_BUCKET: 'bucket-name',
        R2_ENDPOINT: 'https://example.invalid',
        R2_ACCESS_KEY_ID: 'access-secret',
        R2_SECRET_ACCESS_KEY: 'secret-secret',
        R2_PUBLIC_BASE_URL: 'https://downloads.example.invalid'
      },
      artifactExists: () => true
    })

    const serialized = JSON.stringify(report)
    expect(serialized).toContain('"CSC_LINK"')
    expect(serialized).toContain('"present":true')
    expect(serialized).not.toContain('super-secret')
    expect(serialized).not.toContain('access-secret')
    expect(serialized).not.toContain('secret-secret')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/main/release-readiness.test.ts
```

Expected: FAIL because `scripts/release-readiness.cjs` does not exist yet.

## Task 2: Minimal Readiness Module

**Files:**
- Create: `scripts/release-readiness.cjs`

- [ ] **Step 1: Implement minimal redacted report helpers**

Create the module with:

- `presence(env, keys)`
- `createReleaseReadinessReport(options)`
- `classifyReleaseReadiness(report)`
- `runCli(argv, io, processLike)`
- `module.exports` for tests

The first implementation should only be enough to pass the redaction test.

- [ ] **Step 2: Run test to verify it passes**

Run:

```bash
npm test -- src/main/release-readiness.test.ts
```

Expected: PASS for the first redaction test.

## Task 3: Operator Gate Classification

**Files:**
- Modify: `src/main/release-readiness.test.ts`
- Modify: `scripts/release-readiness.cjs`

- [ ] **Step 1: Add failing classification tests**

Add tests for:

- blocked report when signing choice, manual packaged smoke, live-provider smoke, Arabic scope, rollback notes, or publish approval are absent;
- ready report when all local artifact checks and operator flags are present;
- strict CLI exits `1` when blocked and `0` when ready;
- default CLI exits `0` for report generation even when blocked.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/main/release-readiness.test.ts
```

Expected: FAIL on missing classification and CLI behavior.

- [ ] **Step 3: Implement classification and CLI behavior**

Add required gates:

- `releaseOperatorApproved`
- `macSigningDecision`
- `manualPackagedSmoke`
- `liveProviderSmoke`
- `arabicReleaseScope`
- `updateRollbackNotes`
- `publishAuthorization`
- expected package artifact checks.

Use environment variables:

- `OPENCODEX_RELEASE_OPERATOR_APPROVED=1`
- `OPENCODEX_RELEASE_MAC_SIGNING_DECISION=signed-notarized|unsigned-local-beta`
- `OPENCODEX_RELEASE_MANUAL_PACKAGED_SMOKE=1`
- `OPENCODEX_RELEASE_LIVE_PROVIDER_SMOKE=1`
- `OPENCODEX_RELEASE_ARABIC_SCOPE=complete|partial-beta`
- `OPENCODEX_RELEASE_UPDATE_ROLLBACK_NOTES=1`
- `OPENCODEX_RELEASE_PUBLISH_AUTHORIZED=1`

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- src/main/release-readiness.test.ts
```

Expected: PASS.

## Task 4: NPM Script And Docs

**Files:**
- Modify: `package.json`
- Create: `docs/WAVE_6_RELEASE_AUTHORIZATION_READINESS.md`
- Modify: `docs/WAVE_5_RELEASE_CANDIDATE_SMOKE_PACKAGING.md`
- Modify: `docs/WAVE_3_4_UPSTREAM_PARITY_RELEASE_PREP.md`
- Modify: `docs/PHASE_10_PARITY_HARDENING_RELEASE_REPORT.md`

- [ ] **Step 1: Add npm script**

Add:

```json
"release:readiness": "node ./scripts/release-readiness.cjs"
```

- [ ] **Step 2: Add Wave 6 report**

Document:

- command usage;
- local evidence;
- blocked-vs-ready interpretation;
- required operator flags;
- current upstream state: `upstream/master` is `v0.2.8`; `upstream/develop` has 17 commits beyond it and should be treated as a future-lane drift audit unless explicitly approved for pre-release ingestion.

- [ ] **Step 3: Update prior ledgers**

Link Wave 6 from Wave 5, Wave 3-4, and Phase 10 so the newer source of truth is clear.

## Task 5: Verification

**Files:**
- All changed files.

- [ ] **Step 1: Focused tests**

Run:

```bash
npm test -- src/main/release-readiness.test.ts src/main/release-smoke.test.ts src/main/packaging-config.test.ts
```

Expected: PASS.

- [ ] **Step 2: Readiness command smoke**

Run:

```bash
npm run release:readiness -- --json
```

Expected: exits `0` and prints JSON with `status` plus redacted checks.

- [ ] **Step 3: Strict blocked smoke**

Run:

```bash
npm run release:readiness -- --strict
```

Expected: exits `1` until operator gates are intentionally provided. This is a correct blocked result, not a test failure.

- [ ] **Step 4: Full verification gates**

Run:

```bash
npm run typecheck
npm test
npm --prefix kun run typecheck
npm --prefix kun test
npm run smoke:release
git diff --check
```

Expected: all pass, except `release:readiness -- --strict` remains intentionally blocked without operator authorization variables.
