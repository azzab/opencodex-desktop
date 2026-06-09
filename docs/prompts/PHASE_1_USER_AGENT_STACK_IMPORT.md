# Phase 1 Prompt: User Agent Stack Import

## Recommended Model

- Primary: `gpt-5.4`
- Reasoning: `high`
- Why: this phase is implementation-heavy across Electron main, settings,
  redaction, Kun config sync, tests, and UI. `gpt-5.4` is the right default
  implementation model.
- Security review: `gpt-5.5`, reasoning `high`, for secret-redaction and MCP
  config handling review.
- Cheap helper agents: `gpt-5.4-mini`, reasoning `medium`, for read-only skill
  root and config inventory.

## Paste-Ready Goal

```text
/goal Phase 1: User Agent Stack Import

Run from the OpenCodex Desktop repository root.

Objective:
Add a generic User Agent Stack profile so any user can import existing local
agent setup from Codex, Claude Code-compatible folders, .codex/skills,
.agents/skills, plugin cache roots, MCP config files, and common CLI tools.
Persist the result into OpenCodex/Kun settings so Electron packaged mode and
browser/dev mode share the same profile.

Model:
Use gpt-5.4 with reasoning high. Use gpt-5.5 high only for security review of
redaction, MCP import, and secret handling.

Read first:
- AGENTS.md and docs/AGENTS.md
- docs/ENGINE_AUDIT_KUN.md
- docs/REFERENCE_INTAKE.md
- docs/PHASE_1_USER_AGENT_STACK_SPEC.md if present
- src/shared/app-settings-types.ts
- src/shared/app-settings-kun.ts
- src/main/settings-store.ts
- existing skill, MCP, and Kun config sync code

Scope allowed:
- Main-process discovery service
- Shared settings schema/defaults/normalizers
- IPC schemas and handlers
- Kun config sync for skill roots and redacted MCP server definitions
- Settings UI and locale strings
- Focused unit and renderer tests
- Phase 1 spec/report docs

Scope forbidden:
- Do not add personal naming to the public profile.
- Do not persist or print raw secrets.
- Do not mutate original Codex, Claude, shell, or MCP config files.
- Do not add a second runtime.
- Do not push unless explicitly requested.

Required behavior:
1. Discover skill roots from repo-local .codex/skills, repo-local
   .agents/skills, user Codex skills, user agents skills, and Codex plugin
   cache roots when present.
2. Discover MCP server definitions from compatible Codex/user config files and
   convert them into Kun-compatible config with secrets redacted.
3. Check CLI availability for codex, gh, hcloud, node, npm, pnpm, bun, git,
   docker, python, uv, npx, playwright, and common agent CLIs when present.
4. Persist the imported profile under agents.kun.
5. Add settings UI to preview, refresh, and import the redacted profile.
6. Preserve English, Arabic, and Chinese locales.

Verification:
- Unit tests for discovery, MCP conversion, redaction, CLI checks, settings
  normalization, IPC, and Kun config sync.
- Renderer settings test for the User Agent Stack section.
- npm test
- npm run typecheck
- npm run build
```

## Exit Criteria

- A user can import a redacted local agent stack from Settings.
- Kun receives skill roots and redacted MCP server definitions through the same
  settings/config path used by Electron and dev mode.
- No raw secrets are stored in docs, tests, logs, previews, or generated config
  snapshots.

