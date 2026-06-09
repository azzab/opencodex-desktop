# Phase 7 Prompt: Skills, Plugins, Hooks, Rules, And Memory

## Recommended Model

- Primary: `gpt-5.5`
- Reasoning: `high`
- Why: this phase defines reusable capabilities and lifecycle safety rails.
  Skills, plugins, hooks, and memory affect every future agent run.
- Cheap helper agents: `gpt-5.4-mini`, reasoning `medium`, for inventory of
  existing skill/plugin/MCP formats.

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
- docs/REFERENCE_INTAKE.md
- docs/ENGINE_AUDIT_KUN.md
- Phase 1 User Agent Stack import code/spec
- current Kun skills, MCP, memory, config, tool-host, settings, and renderer
  diagnostics code

Scope allowed:
- Skill registry and browser
- Plugin import/export metadata
- Hook contracts/events and deterministic hook execution
- Rules/memory settings and project/user scopes
- MCP/skill diagnostics UI
- Tests and Phase 7 docs/report

Scope forbidden:
- Do not execute untrusted plugin code without explicit permission.
- Do not load all skills into prompt context by default.
- Do not store secret values in exported profiles.
- Do not make renderer state the authority for hook decisions.
- Do not push unless explicitly requested.

Required behavior:
1. Add visible skill registry with source, scope, trigger, enabled state, and
   diagnostics.
2. Add plugin import/export metadata without executing arbitrary code.
3. Add hook lifecycle model for pre-tool, permission request, post-tool,
   compaction, session start/stop, subagent start/stop, and user prompt submit.
4. Add hook trust review and allow/deny policy.
5. Add user/project rules and memory visibility with redaction.
6. Add compatibility import from Codex, Claude Code, OpenCode, and MCP
   conventions where feasible.
7. Preserve progressive disclosure so skills load only when relevant.

Verification:
- Skill registry tests.
- Plugin manifest validation tests.
- Hook lifecycle and deny/allow tests.
- Memory/rules redaction tests.
- Renderer diagnostics tests.
- npm test
- npm run typecheck
- npm run build
```

## Exit Criteria

- Users can see what skills, tools, rules, hooks, and memory are active.
- Reusable capabilities are importable/exportable without leaking secrets.
- Hooks add deterministic safety rails without replacing verification.

