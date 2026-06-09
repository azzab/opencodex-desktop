# Phase 10 Prompt: Parity Hardening, Security, And Release

## Recommended Model

- Primary: `gpt-5.5`
- Reasoning: `extra high`
- Why: this is the convergence phase for security, governance, packaging,
  updater behavior, release readiness, and near-Codex feature completeness.
  It requires adversarial review and careful proof.
- Cheap helper agents: `gpt-5.4-mini`, reasoning `medium`, for inventory lanes
  only. Final synthesis stays with `gpt-5.5`.

## Paste-Ready Goal

```text
/goal Phase 10: Parity Hardening, Security, and Release

Run from the OpenCodex Desktop repository root.

Objective:
Harden OpenCodex Desktop toward a near-Codex local desktop experience while
remaining independent. Audit feature completeness, permissions, secrets,
upstream sync, packaging, update channels, locale quality, cost controls,
subagents, browser/computer-control guardrails, remote/mobile safety, and
release readiness.

Model:
Use gpt-5.5 with reasoning extra high.

Read first:
- AGENTS.md and docs/AGENTS.md
- README.md and LANDING.md
- docs/REFERENCE_INTAKE.md
- docs/ENGINE_AUDIT_KUN.md
- docs/DESKTOP_UX_BENCHMARK.md
- all Phase 1-9 specs/reports/prompts
- package scripts, Electron packaging config, security/CSP code, settings,
  updater, Kun runtime contracts, and release docs

Scope allowed:
- Security and readiness audit docs
- Focused fixes for blockers found during the audit
- Packaging/updater/release docs
- Locale completion checks
- Test hardening
- Final parity matrix and release report

Scope forbidden:
- Do not claim 99 percent parity without evidence.
- Do not publish a release, push tags, or upload binaries unless explicitly
  requested.
- Do not remove upstream attribution or non-affiliation notices.
- Do not weaken permission, redaction, or audit behavior for UX convenience.
- Do not push unless explicitly requested.

Required behavior:
1. Build a parity matrix against the OpenCodex target: projects, threads,
   app-server, Git/worktrees, terminal, browser, computer control, skills,
   MCP, hooks, memory, automations, subagents, model routing, usage/cost,
   remote/mobile, IDE/CLI bridge, and artifacts.
2. Run security review for renderer isolation, IPC schemas, secrets, MCP,
   browser/computer control, remote/mobile, hooks/plugins, and updater.
3. Run localization review for English, Arabic RTL, and Chinese.
4. Run packaging/release review for macOS signing/notarization readiness,
   update channels, rollback notes, and release notes.
5. Fix only scoped blockers that are safe to fix in this phase.
6. Produce final release-readiness report with evidence and remaining blockers.

Verification:
- npm test
- npm run typecheck
- npm run build
- Packaging dry-run if configured and safe.
- Security-focused tests for IPC, redaction, permissions, and CSP.
- Manual smoke checklist for desktop startup and core workbench flows.
```

## Exit Criteria

- OpenCodex has an evidence-backed parity and readiness report.
- Critical security and release blockers are fixed or explicitly documented.
- The project is ready for a deliberate beta/release decision, not an accidental
  publish.

