# Kun Engine Audit

## Question

Can Kun become the OpenCodex kernel for a Codex-like desktop workbench?

## Current Answer

Yes, as a starting point. Kun already has the right runtime boundary: local HTTP/SSE, persisted threads/events/usage, approvals, cache-first loop, CLI entrypoints, MCP/skills/subagent capability flags, and GUI integration.

Kun is not yet Codex-like. It needs a focused kernel upgrade program.

## Non-Negotiable Runtime Rule

OpenCodex Desktop must not add a second live agent runtime beside Kun. Any new capability should go through:

1. `kun/src/contracts/`
2. `kun/src/loop/`, `kun/src/services/`, or `kun/src/ports/` and `kun/src/adapters/`
3. `kun/src/server/routes/`
4. `src/renderer/src/agent/kun-runtime.ts`
5. `src/renderer/src/agent/kun-mapper.ts`
6. settings under `agents.kun`

## Gaps To Close

### Provider And Model Kernel

Required:

- provider registry;
- OpenRouter model catalog import;
- context length and pricing metadata;
- provider/model capability metadata;
- model picker;
- model roles: primary, planner, reviewer, cheap child, utility, vision;
- automatic routing by task, cost, context, tool support, and reasoning need.

Current risk: DeepSeek-compatible settings exist, but the kernel is not yet a general provider runtime.

### Planning And Execution

Required:

- manual plan mode;
- optional auto-plan classifier using a cheap model;
- planner/executor split;
- read-only planner tools;
- approval before mutating work;
- resumable goal mode.

Current risk: planning exists in the GUI, but kernel-level planner/executor roles are incomplete.

### Checkpoints And Rewind

Required:

- checkpoint before each mutating turn;
- restore code only;
- restore conversation only;
- restore both;
- fork from checkpoint;
- show checkpoint metadata in UI;
- never rely on destructive git commands for rewind.

Reasonix is the reference for this design.

### MCP And Skills

Required:

- MCP tools;
- MCP prompts as slash commands;
- MCP resources as `@server:uri`;
- background MCP connection diagnostics;
- Skill roots from Codex, Claude Code, `.codex/skills`, `.agents/skills`, and plugin caches;
- skill enable/disable per project;
- safe import/export.

Current risk: MCP and skills are present as directions, but not yet a complete Codex/Claude-compatible profile system.

### Slash Commands And References

Required:

- `/compact`, `/new`, `/clear`, `/goal`, `/plan`, `/review`, `/mcp`, `/memory`, `/model`, `/cost`, `/checkpoint`, `/rewind`;
- project/user custom commands from Markdown files;
- `@file`, `@directory`, `@thread`, `@mcp-resource`;
- autocomplete in the composer.

### Permissions And Sandbox

Required:

- allow/ask/deny policy;
- command denylist and allowlist;
- workspace write confinement;
- symlink and `..` escape protection;
- OS-level sandbox where available;
- approval and audit log for elevated operations.

Current risk: Electron UI permissions and Kun approval policies exist, but OS-level enforcement and rule richness need expansion.

### Browser And Computer Control

Required:

- in-app browser tools;
- browser DOM/selector tools;
- screenshot and annotation capture;
- local app preview verification;
- Appshot-style window capture;
- guarded click/type/scroll computer control;
- emergency stop;
- full audit log.

This should be built through sidecars and Kun tools, not renderer-only scripts.

### Observability And Cost

Required:

- provider-level token usage;
- cost by thread/project/model;
- cache hit/miss and unknown telemetry states;
- budget warnings;
- child-agent usage rollup;
- exportable reports.

## Keep, Change, Or Replace

Keep:

- Kun as single runtime;
- append-only session storage;
- HTTP/SSE contract;
- cache-first economics;
- Electron integration.

Change:

- provider model abstraction;
- MCP and Skills import depth;
- permissions/sandbox model;
- checkpoint system;
- browser/computer-control tool surface.

Replace only if:

- Kun cannot safely support provider registries and model roles;
- OS sandboxing cannot be composed with Kun tools;
- checkpoint/rewind cannot be implemented without corrupting sessions;
- Electron/Kun IPC becomes a hard reliability blocker after measured evidence.

## Audit Outcome

Proceed with Kun as the OpenCodex kernel. Revisit replacement only after Phases 1-4 expose concrete technical blockers.
