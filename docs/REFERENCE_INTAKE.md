# Reference Intake

OpenCodex Desktop began as a fork of DeepSeek GUI and its Kun runtime. The product direction is broader: an independent Codex-style desktop agent workbench for local coding, project operations, browser/app verification, reusable skills, MCP tools, model routing, and controlled subagents.

## Compass

Codex is the product compass. OpenCodex Desktop should study Codex's public desktop direction: project-connected threads, multi-agent workflows, worktrees, Skills, Automations, in-app browser, Computer Use, Appshots, app/browser annotations, and goal-driven long-running work.

Claude Code Desktop is the second benchmark for local developer UX: parallel sessions, Git worktree isolation, drag-and-drop panes, integrated terminal and file editor, side chats, visual diff review, previews, PR monitoring, connectors, and computer use.

## Foundation

DeepSeek GUI and Kun are the fork foundation. The project keeps upstream available as `upstream` for major fixes, packaging updates, and Kun improvements.

OpenCodex Desktop should not restore old CodeWhale or Reasonix runtime adapters. New behavior should land through Kun contracts, settings, services, and adapters.

## Technical References

### Reasonix

Use Reasonix as a coding-agent kernel reference, especially:

- config-driven providers, tools, and plugins;
- planner/executor split in separate cache-stable sessions;
- subagent model defaults and per-skill child model overrides;
- checkpoint/rewind for code, conversation, or both;
- slash commands;
- `@file`, `@directory`, and `@mcp-resource` references;
- MCP tools, prompts, and resources;
- permissions plus workspace sandbox;
- compaction and cache-first economics.

Do not copy Reasonix's product stance that DeepSeek-only is the feature. OpenCodex Desktop must support DeepSeek, OpenRouter, and compatible providers.

Do not rewrite OpenCodex Desktop into Go/Wails unless a future engine audit proves Electron/Kun cannot meet the target.

Reference: https://github.com/esengine/DeepSeek-Reasonix

### OpenHanako

Use OpenHanako as a desktop workbench reference, especially:

- plugin marketplace and developer loop;
- restricted vs full-access plugin permissions;
- plugin pages, widgets, routes, providers, tools, and background tasks;
- Desk-style async workspace for files and notes;
- session file sidecars and media handling;
- multi-agent channels and delegation;
- scheduled tasks and heartbeat;
- mobile/LAN frontends;
- application-level PathGuard plus OS-level sandboxing;
- model roles for chat, utility, large utility, and vision.

Do not copy OpenHanako's personality-first branding. OpenCodex Desktop should stay a serious agent workbench.

Reference: https://github.com/liliMozi/openhanako

## Desktop Orchestration Benchmarks

Study desktop shells such as Crest, cdesktop, and Olenro for workflow ideas:

- side-by-side agents;
- agent teams and routines;
- worktrees, previews, diffs, and PRs;
- config/profile management across Codex, Claude Code, OpenCode, Gemini, and MCP;
- pane layout and process supervision.

These are benchmarks, not dependencies.

References:

- https://www.crestai.dev/
- https://cdesktop.ai/
- https://olenro.com/

## Market Benchmarks

Also compare against:

- official OpenAI Codex CLI/app;
- Claude Code and Claude Code Desktop;
- OpenCode;
- Goose;
- Aider;
- Continue and related IDE/agent surfaces where relevant.

## Non-Affiliation

OpenCodex Desktop is independent and is not affiliated with OpenAI, Anthropic, DeepSeek, DeepSeek GUI, OpenHanako, Reasonix, Crest, cdesktop, Olenro, OpenCode, Goose, Aider, or their maintainers. Names are used only for attribution, compatibility, and benchmark context.

## Intake Rule

Every borrowed idea must be translated into OpenCodex Desktop's architecture:

```text
reference idea -> OpenCodex requirement -> Kun contract/service -> Electron UI surface -> tests/verification
```

Do not paste feature lists into implementation without mapping them to this project.
