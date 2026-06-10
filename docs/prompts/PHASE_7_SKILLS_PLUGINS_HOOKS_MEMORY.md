# Phase 7 Prompt: Skills, Plugins, Hooks, Rules, And Memory

## Recommended Model

- Primary: `gpt-5.5`
- Reasoning: `high`
- Why: this phase defines reusable capabilities and lifecycle safety rails.
  Skills, plugins, hooks, and memory affect every future agent run.
- Cheap helper agents: `gpt-5.4-mini`, reasoning `medium`, for inventory of
  existing skill/plugin/MCP formats.

## Preflight Gate From Phase 6

- Phase 6 must be reviewed before Phase 7 starts changing shared workbench
  surfaces. Read `docs/PHASE_6_GIT_WORKTREES_REVIEW_REPORT.md`.
- Check the current diff first. If Phase 6 Git review code is still unstaged,
  preserve it and do not mix unrelated fixes into Phase 7.
- Confirm the Git review surface does not suggest direct pushes to the base
  branch and can distinguish staged and unstaged patches for the same file
  before relying on it for Phase 7 review work.

## Paste-Ready Goal

```text
/goal Phase 7: Skills, Plugins, Hooks, Rules, and Memory

Run from the OpenCodex Desktop repository root.

Objective:
Make OpenCodex reusable and configurable across projects. Add visible Skills,
plugins, hooks, rules, and memory management that imports from common agent
tool conventions while keeping secrets redacted and runtime behavior inside
Kun.

Model:
Use gpt-5.5 with reasoning high.

Read first:
- AGENTS.md and docs/AGENTS.md
- /Users/mohamedazab/saas-foundry/CONSTITUTION.md
- /Users/mohamedazab/saas-foundry/ADOPTION_MATRIX.md
- SaaS Foundry routed docs for Desktop Electron agent apps, agent tools,
  API/MCP/CLI/UI surfaces, security/permissions/audit, and prompt handoffs
- docs/REFERENCE_INTAKE.md
- docs/ENGINE_AUDIT_KUN.md
- docs/prompts/README.md
- docs/prompts/PHASE_7_SKILLS_PLUGINS_HOOKS_MEMORY.md
- docs/PHASE_6_GIT_WORKTREES_REVIEW_REPORT.md
- Phase 1 User Agent Stack import code/spec
- current GUI skill service, plugin marketplace, settings skill/MCP/memory
  surfaces, Kun skills, MCP, memory, hooks, config, tool-host, IPC/preload,
  and renderer diagnostics code

Scope allowed:
- Skill registry, browser, and progressive skill slash-command visibility
- Plugin manifest/import/export metadata and validation
- Hook contracts/events and deterministic hook execution through Kun/service
  boundaries
- Rules/memory settings and project/user scopes
- MCP/skill diagnostics UI
- Tests and Phase 7 docs/report
- Small Phase 6 Git review blocker fixes only if they are required before
  using the Git review surface for Phase 7

Scope forbidden:
- Do not execute untrusted plugin code without explicit permission.
- Do not add a second live runtime or bypass Kun for skill, hook, MCP, memory,
  or rule execution.
- Do not expose raw Node, shell, filesystem, MCP, provider, or plugin execution
  directly to the renderer.
- Do not make hooks an unrestricted command runner.
- Do not load all skills into prompt context by default.
- Do not let memory or exported profiles contain API keys, OAuth tokens,
  `.env` values, cookies, private payloads, or raw provider credentials.
- Do not store secret values in exported profiles.
- Do not make renderer state the authority for hook decisions.
- Do not remove English, Arabic, or Chinese support.
- Do not push unless explicitly requested.

Required behavior:
1. Inventory existing skill, plugin, MCP, hook, memory, and rules surfaces
   before writing code. Separate current behavior from desired compatibility.
2. Add visible skill registry with source, scope, trigger, enabled state,
   entry path, validation errors, and diagnostics.
3. Add plugin import/export metadata without executing arbitrary code. Validate
   manifests and redact secrets in exported profiles.
4. Add hook lifecycle model for pre-tool, permission request, post-tool,
   compaction, session start/stop, subagent start/stop, and user prompt submit.
5. Add hook trust review and allow/deny policy. Hook execution must be service
   or Kun owned, audited where mutating, timeout-bounded, and visible to the UI.
6. Add user/project rules and memory visibility with redaction, disable/delete
   controls, and clear scope labels.
7. Add compatibility import from Codex, Claude Code, OpenCode, and MCP
   conventions where feasible, marking unsupported fields as diagnostics rather
   than silently ignoring them.
8. Preserve progressive disclosure so skills and memory load only when relevant
   and never as a full-context dump.

Verification:
- Phase 6 carry-forward tests if touched:
  `npm test -- src/main/services/git-service.test.ts src/renderer/src/components/ChangeInspector.test.ts`
- Skill registry tests.
- Existing GUI skill tests:
  `npm test -- src/main/services/skill-service.test.ts`
- Plugin manifest validation tests.
- Hook lifecycle and deny/allow tests.
- Memory/rules redaction tests.
- MCP/settings/plugin marketplace diagnostics tests.
- Renderer diagnostics tests.
- npm test
- npm run typecheck
- npm run build
- git diff --check
```

## Exit Criteria

- Users can see what skills, tools, rules, hooks, and memory are active.
- Reusable capabilities are importable/exportable without leaking secrets.
- Hooks add deterministic safety rails without replacing verification.
