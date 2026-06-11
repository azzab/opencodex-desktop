# Wave 7 Upstream Develop Drift Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record the unreleased `upstream/develop` drift after `v0.2.8` so future work can decide what to integrate without destabilizing the current release-candidate lane.

**Architecture:** This is an evidence-only audit wave. It uses `git fetch`, `git log`, `git diff --stat`, and current-tree searches to classify unreleased upstream areas into future integration candidates. No upstream code is merged, cherry-picked, staged, tagged, pushed, uploaded, or released.

**Tech Stack:** Git, Markdown release ledger, existing OpenCodex Desktop guardrails.

---

## File Structure

- Create `docs/WAVE_7_UPSTREAM_DEVELOP_DRIFT_AUDIT.md`
  - Captures upstream state after fresh fetch.
  - Lists 17 `develop` commits outside `v0.2.8`.
  - Classifies future integration candidates.
  - Records why this is not part of the `0.2.8` release lane.
- Modify `docs/WAVE_6_RELEASE_AUTHORIZATION_READINESS.md`
  - Link Wave 7 as the follow-up drift audit.

## Task 1: Collect Drift Evidence

**Files:**
- No edits yet.

- [ ] **Step 1: Fetch upstream**

Run:

```bash
git fetch upstream --tags --prune
```

Expected: exits `0`.

- [ ] **Step 2: Capture branch relationship**

Run:

```bash
git describe --tags --always upstream/master
git rev-parse --short upstream/master
git rev-parse --short upstream/develop
git rev-list --left-right --count upstream/master...upstream/develop
```

Expected current evidence:

```text
v0.2.8
f1f8d1b
e7e8252
12 17
```

- [ ] **Step 3: Capture commit and file drift**

Run:

```bash
git log --reverse --oneline upstream/master..upstream/develop
git diff --stat upstream/master..upstream/develop
git diff --name-status upstream/master..upstream/develop
```

Expected: 17 commits, 124 files changed, about 9.7k insertions.

## Task 2: Write Drift Audit

**Files:**
- Create: `docs/WAVE_7_UPSTREAM_DEVELOP_DRIFT_AUDIT.md`
- Modify: `docs/WAVE_6_RELEASE_AUTHORIZATION_READINESS.md`

- [ ] **Step 1: Add Wave 7 audit**

Document:

- exact upstream state;
- commit list;
- major feature/runtime groups;
- candidate future waves;
- explicit decision not to merge this into `0.2.8` without operator approval.

- [ ] **Step 2: Link Wave 7 from Wave 6**

Add a follow-up note to the Wave 6 readiness document.

## Task 3: Verification

**Files:**
- Changed Markdown docs.

- [ ] **Step 1: Whitespace check**

Run:

```bash
git diff --check
```

Expected: exits `0`.

- [ ] **Step 2: Release readiness remains unchanged**

Run:

```bash
npm run release:readiness -- --json
```

Expected: exits `0`; package artifacts remain present; status remains blocked only because operator gates are missing.
