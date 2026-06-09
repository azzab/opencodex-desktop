# OpenCodex Progress Audit Prompt

Use this companion prompt when a fresh LLM window needs to check what
OpenCodex Desktop has actually built so far against the project roadmap,
completed prompts, active specs, and future phase prompts.

## Recommended Model

- Primary: `gpt-5.5`
- Reasoning: `extra high`
- Why: this is a cross-phase architecture, implementation, test, and roadmap
  audit. The model must compare docs, prompts, code, tests, UI, settings,
  runtime contracts, and risk boundaries without making unsupported claims.
- Optional helper agents: `gpt-5.4-mini`, reasoning `medium`, for read-only
  inventory lanes only. The lead auditor must synthesize the final report.

## Audit Mode

Read-only. Do not edit code, docs, config, package files, generated files,
tests, or lockfiles. Do not stage, commit, push, pull, rebase, or clean files.

The audit may run read-only inspection commands such as `git status`, `git
diff --stat`, `rg`, `find`, `sed`, `ls`, `git log`, and `npm run` script
inspection. Ask before running heavy commands if they may write artifacts,
start servers, or take a long time.

## Paste-Ready Full Prompt

```text
/goal OpenCodex Desktop Progress And Parity Audit

Run from the OpenCodex Desktop repository root.

Mode:
Read-only audit. Do not edit files. Do not stage, commit, push, pull, rebase,
clean, format, install, start long-running servers, or mutate config.

Objective:
Audit what OpenCodex Desktop has actually built so far against the project
plan, README roadmap, phase prompts, previous phase specs/reports, and coming
phase prompts. Produce a truth report: done, mostly done, partial, planned
only, missing, risky, built ahead of plan, claimed without enough evidence,
and recommended next action.

Model:
Use gpt-5.5 with reasoning extra high.

Read first:
- AGENTS.md if present
- README.md
- LANDING.md
- docs/AGENTS.md
- docs/prompts/README.md
- docs/prompts/OPENCODEX_PROGRESS_AUDIT_PROMPT.md
- every docs/prompts/PHASE_*.md file
- docs/PHASE_0_5_GOAL.md
- docs/REFERENCE_INTAKE.md
- docs/ENGINE_AUDIT_KUN.md
- docs/DESKTOP_UX_BENCHMARK.md
- docs/BROWSER_COMPUTER_CONTROL_PLAN.md
- docs/PHASE_1_USER_AGENT_STACK_SPEC.md if present
- docs/PHASE_2_MULTI_PROVIDER_MODEL_RUNTIME_SPEC.md if present
- docs/PHASE_2_VERIFICATION_REPORT.md if present
- docs/PHASE_3_SUBAGENTS_SWARM_SPEC.md if present
- docs/PHASE_3_VERIFICATION_REPORT.md if present
- docs/PHASE_4_BROWSER_AUTOMATION_SECURITY_SPEC.md if present
- package.json
- src/shared/app-settings-types.ts
- src/shared/app-settings-kun.ts
- src/main/settings-store.ts
- src/main/services/
- src/main/ipc/
- src/preload/
- src/renderer/src/agent/
- src/renderer/src/components/
- src/renderer/src/locales/
- kun/src/contracts/
- kun/src/loop/
- kun/src/adapters/
- kun/src/server/
- kun/src/telemetry/
- kun/tests/

Hard rules:
- Compare implementation evidence, tests, and docs. Do not trust roadmap text
  without code/test evidence.
- Preserve the Kun single-kernel decision unless source evidence proves a hard
  blocker.
- Preserve Electron as the desktop shell.
- Preserve English, Arabic, and Chinese support.
- Do not remove or weaken upstream DeepSeek GUI attribution.
- Do not add personal branding to public product surfaces.
- Do not expose secrets, private config, `.env` values, cookies, OAuth tokens,
  API keys, raw provider payloads, or private infrastructure details.
- Do not use Proxima-only conclusions. If external comparison is needed, mark
  it as optional and separate from the local evidence audit.

Audit tasks:
1. Run git status and identify branch, ahead/behind state, modified files,
   untracked files, and whether current dirty files appear related to phases.
2. Build a phase matrix for Phase 0, 0.5, 1, 2, 3, 3.5, 4, 4.5, 5, 6, 7, 8,
   9, and 10.
3. For each phase, classify status as Done, Mostly done, Partial, Planned only,
   Missing, or Risky / needs redesign.
4. For each phase, cite evidence from docs, source files, tests, settings,
   runtime contracts, UI surfaces, and reports.
5. Identify features built ahead of their planned phase.
6. Identify features claimed in README/specs/reports but not proven by code or
   tests.
7. Identify code that exists but lacks meaningful tests.
8. Identify tests that exist but do not prove the full user-facing behavior.
9. Check architecture risks around Kun, Electron main/preload/renderer,
   provider/model routing, cost/cache telemetry, subagents, budgets,
   browser/computer automation, remote/mobile, MCP/skills, hooks, memory,
   permissions, approvals, redaction, and i18n.
10. Recommend the next best action: continue implementation, stabilize current
   phases, fix docs/spec mismatch, run security audit, or start a specific next
   phase.

Required report structure:
# OpenCodex Desktop Progress Audit

## Executive Summary
Short truth summary.

## Current Repo State
Branch, ahead/behind state, dirty files, untracked files, and whether the audit
was read-only.

## Phase Matrix
Table with:
Phase | Planned goal | Actual status | Evidence | Gaps | Recommended next action

## Implemented Features
Group by docs, settings, Kun runtime, Electron main/preload, renderer UI,
tests, i18n, provider/model, MCP/skills, subagents, automation, and telemetry.

## Partial Or Risky Features
Explain what exists but is incomplete, weakly tested, or unsafe to rely on.

## Missing Features
List what the prompts and roadmap expect but the repo does not yet have.

## Claims Vs Evidence
List any README/spec/report claims that are stronger than the code/tests prove.

## Test Coverage And Verification Gaps
List exact missing or weak tests and recommended verification commands.

## Architecture Risks
Focus on Kun single-kernel integrity, Electron security, redaction, permissions,
MCP/skills, subagents, automation, remote/mobile, and provider cost routing.

## Recommended Next Step
Pick one next action and explain why.

## Optional Follow-Up Caller Prompt
End with one compact /goal prompt for the recommended next action.

Final rules:
- Do not create files unless explicitly asked.
- If a source file is too large, cite relevant paths and line ranges instead of
  reading everything.
- If evidence is missing, say "not proven" instead of guessing.
- Keep the final report actionable and source-backed.
```

## Expected Audit Outcome

The auditor should produce a phase-by-phase truth report that lets the project
owner decide whether to continue the next phase, stabilize already-built work,
or run a security/docs cleanup pass before more implementation.

