# Reference Intake

OpenCodex Desktop is an independent fork and rebrand of DeepSeek GUI by XingYu-Zhong and contributors. DeepSeek GUI/Kun is the upstream foundation, the current runtime base, and the future upstream merge source.

OpenCodex Desktop is not affiliated with OpenAI, Anthropic, DeepSeek, OpenRouter, OpenHanako, Reasonix, Crest, cdesktop, Olenro, OpenCode, Goose, Aider, or their maintainers. Public project and company names in these docs are used only for attribution, compatibility, product positioning, and benchmark context. They do not imply endorsement, sponsorship, or code ownership.

## Product Compass

Codex is the product compass.

Codex is the quality and capability compass: OpenCodex Desktop should study Codex-like workflows for project-connected threads, long-running goals, file edits, terminal and browser verification, multi-agent task state, worktree-aware execution, Skills, MCP, memory, automation, and visible approvals.

Claude Code and Claude Code Desktop are target-class references for developer ergonomics: parallel sessions, terminal/file/diff surfaces, worktree isolation, project trust boundaries, side chats, app previews, connector visibility, and explicit computer-use controls.

The goal is target-class parity in workflow quality, not product affiliation or brand imitation.

## Upstream Foundation: DeepSeek GUI/Kun

DeepSeek GUI/Kun provides the fork foundation:

- Electron desktop shell;
- Kun local HTTP/SSE runtime;
- DeepSeek-compatible model path;
- cache-first runtime discipline;
- persisted sessions, threads, usage, approvals, and runtime events;
- current English, Arabic, and Chinese locale surface;
- upstream sync path for future DeepSeek GUI improvements.

OpenCodex Desktop should keep upstream merge discipline. Rebrand and workbench additions should stay modular so future DeepSeek GUI/Kun updates can still be reviewed and pulled.

## Technical References

### OpenHanako

OpenHanako is a technical reference for a broad desktop agent workbench:

- plugin marketplace and developer loop;
- restricted vs full-access plugin permissions;
- workspace/Desk-style files, notes, and sidecars;
- multi-agent channels and delegation;
- scheduled tasks and heartbeat patterns;
- media/session files and app context capture;
- LAN/mobile observer surfaces;
- PathGuard and OS-level sandboxing ideas.

OpenCodex Desktop should not copy OpenHanako's personality-first brand posture. The translation should be a serious workbench requirement mapped into Kun contracts, Electron UI, permissions, and tests.

Reference: https://github.com/liliMozi/openhanako

### Reasonix

Reasonix is a technical reference for coding-agent kernel direction:

- provider/tool/plugin configuration;
- planner/executor split;
- subagent model defaults and child-model overrides;
- checkpoint and rewind design;
- slash commands;
- `@file`, `@directory`, and MCP resource references;
- MCP tools, prompts, and resources;
- permission and workspace sandbox models;
- compaction and cache-first economics.

OpenCodex Desktop should not restore Reasonix as a second live runtime. Useful ideas must be translated into Kun contracts, services, ports/adapters, HTTP routes, renderer mappers, and desktop UI.

Reference: https://github.com/esengine/DeepSeek-Reasonix

## Desktop And Workflow Benchmarks

Use these projects as benchmarks and inspiration only:

- Crest: side-by-side Codex/Claude-style agent desktop workflows. Reference: https://www.crestai.dev/
- cdesktop: agent teams, routines, worktrees, previews, diffs, and PR workflows. Reference: https://cdesktop.ai/
- Olenro: provider, MCP, skill, rule, hook, and agent configuration across multiple CLI tools. Reference: https://olenro.com/
- OpenCode: terminal/CLI-first coding-agent ergonomics, command workflows, and provider flexibility.
- Goose: local agent extensibility, tool orchestration, and desktop/operator use cases.
- Aider: Git-centered pair-programming workflow, diff discipline, and repo-local coding flow.

These references should inform requirement quality. They should not become dependencies by default, and no benchmark project should be described as endorsing OpenCodex Desktop.

## Intake Rule

Every borrowed idea must pass through this mapping before implementation:

```text
reference idea
  -> OpenCodex Desktop requirement
  -> Kun contract/service/port/adapter
  -> Electron main or renderer surface
  -> permission/audit/telemetry behavior
  -> tests and verification evidence
```

If an idea cannot be mapped without adding a casual second runtime, unsafe computer control, secret exposure, or an upstream-hostile rewrite, it stays out of Phase 1.
