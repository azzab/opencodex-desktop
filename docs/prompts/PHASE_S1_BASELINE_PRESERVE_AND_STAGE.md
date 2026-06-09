# Phase S1 Goal Prompt: Baseline Preserve And Stage

Recommended model: `gpt-5.5`
Recommended reasoning: `high`
Escalate to: `extra high` if staged and unstaged changes conflict or ownership is unclear.

## Purpose

Preserve the verified OpenCodex Desktop Phase 0-4 baseline before starting Phase 4.5 or Phase 5.

This is an operational stabilization phase. The repo has passing S0 verification, but the worktree may contain staged, unstaged, and untracked changes from multiple runs. Your job is to classify the work safely, propose a staging/commit plan, and wait for explicit approval before mutating git state.

## Working Directory

Run from:

```text
/Users/mohamedazab/opencodex-desktop
```

## Source Documents To Read First

Read these before making claims:

```text
README.md
docs/prompts/README.md
docs/PHASE_S0_STABILIZATION_REPORT.md
docs/PHASE_1_VERIFICATION_REPORT.md
docs/PHASE_2_VERIFICATION_REPORT.md
docs/PHASE_3_VERIFICATION_REPORT.md
docs/PHASE_4_VERIFICATION_REPORT.md
```

If any report is missing, record that as a gap instead of inventing status.

## Hard Rules

- Start read-only.
- Do not edit files during the initial inspection.
- Do not stage, unstage, commit, push, pull, rebase, reset, checkout, clean, install, start servers, or mutate config until explicitly approved.
- Preserve existing staged state. Do not unstage anything unless approval explicitly says to do that.
- Do not revert unrelated work.
- Do not stage secrets, `.env` files, private local config, logs, `tmp/`, build outputs, packaged artifacts, or generated cache folders unless explicitly approved with exact paths.
- Keep English, Arabic, and Chinese support.
- Keep upstream DeepSeek GUI attribution and OpenCodex non-affiliation language.
- Keep Electron as the shell and Kun as the single kernel unless a written engine audit says otherwise.

## Read-Only Inspection Commands

Run and summarize:

```bash
git status --short --branch
git log --oneline --decorate -5
git diff --stat
git diff --cached --stat
git diff --name-status
git diff --cached --name-status
```

Use targeted diffs for suspicious files:

```bash
git diff -- path/to/file
git diff --cached -- path/to/file
```

## Classification Work

Classify every dirty path into one of these groups:

1. S0 stabilization: reports, roadmap corrections, branding/i18n fixes, product-brand regression tests, focused test fixes.
2. Phase 1 User Agent Stack import.
3. Phase 2 multi-provider model runtime.
4. Phase 3 subagents and swarm workflows.
5. Phase 3.5 goal, loop, and scheduler work.
6. Phase 4 browser/computer-control foundation.
7. Branding, assets, app identity, packaging, and release metadata.
8. Prompt library and roadmap docs.
9. Generated, transient, private, or excluded files.
10. Unknown-owner files requiring user decision.

For mixed staged/unstaged files, identify both layers separately.

## Proposed Commit Plan

Produce a commit plan based on the actual diffs. Do not blindly use these examples, but consider this structure if it matches the tree:

```text
docs: preserve OpenCodex phase prompts and reports
chore: stabilize OpenCodex Phase 0-4 baseline
feat: add OpenCodex branding assets and shell identity
feat: add user agent stack import
feat: add multi-provider model runtime
feat: add controlled subagents
feat: add automation foundation
```

Each proposed commit must list:

- Exact paths to include.
- Exact paths to exclude.
- Why those paths belong together.
- Required verification after the commit.
- Any risk or ambiguity.

## Verification Policy

During read-only planning, do not rerun heavy verification unless explicitly asked. Use the existing S0 report as prior evidence.

If approval includes staging and commit, run verification appropriate to the staged scope before finalizing:

```bash
npm test
npm run typecheck
npm run build
```

If the staged scope touches `kun/`, also run:

```bash
npm --prefix kun run typecheck
npm --prefix kun test
```

If only docs are committed, run lightweight checks instead:

```bash
rg -n "OpenCodex|DeepSeek GUI|Not affiliated|Phase S1" README.md docs
```

## Approval Gate

Stop after the staging plan and ask for exactly one of these approvals:

```text
Approve S1 staging plan only
Approve S1 staging and commit
Approve S1 docs-only commit
Revise S1 plan
```

Do not proceed unless the user replies with an explicit approval.

## Required Output

Your read-only S1 report must include:

- Current branch and ahead/behind state.
- Existing staged changes.
- Existing unstaged changes.
- Existing untracked changes.
- File classification table.
- Proposed commit plan.
- Excluded paths.
- Verification required per proposed commit.
- Risks and open questions.
- The exact approval phrase needed to continue.

## Success Criteria

S1 is complete only when:

- Dirty work is classified without losing ownership context.
- A safe staging/commit plan exists.
- User approval is captured before any git mutation.
- If approved, relevant files are staged and committed with verification evidence.
- No secrets, transient files, or unrelated user work are accidentally included.
- No push happens unless the user gives separate explicit approval.
