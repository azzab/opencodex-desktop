# Desktop UX Benchmark

## Position

The desktop app is the selling point. OpenCodex Desktop should feel like a command center for agentic coding and operator work, not a web chat embedded in Electron.

## Primary Benchmarks

### Codex Desktop

Benchmark capabilities:

- project-connected threads;
- multi-agent command center;
- worktrees and background work;
- in-app browser;
- browser annotations;
- Computer Use;
- Appshots;
- Goal mode;
- Automations;
- memory and context-aware suggestions;
- PR review and richer artifact previews.

References:

- https://openai.com/codex/
- https://openai.com/codex/get-started/
- https://help.openai.com/en/articles/11369540
- https://help.openai.com/en/articles/6825453-chatgpt-release-notes

### Claude Code Desktop

Benchmark capabilities:

- parallel sessions with Git isolation;
- drag-and-drop pane layout;
- integrated terminal;
- file editor;
- side chats;
- visual diff review;
- app previews;
- PR monitoring;
- connectors;
- computer use;
- scheduled/dispatch flows.

References:

- https://code.claude.com/docs/en/desktop
- https://code.claude.com/docs/en/desktop-quickstart
- https://code.claude.com/docs/en/worktrees
- https://code.claude.com/docs/en/how-claude-code-works

## Secondary Benchmarks

### Crest

Use as a benchmark for running Claude Code and Codex side by side in a native desktop app.

Reference: https://www.crestai.dev/

### cdesktop

Use as a benchmark for agent teams, routines, worktrees, previews, diffs, and PR workflows.

Reference: https://cdesktop.ai/

### Olenro

Use as a benchmark for managing provider, MCP, skill, rule, hook, and agent configuration across multiple CLI tools.

Reference: https://olenro.com/

### OpenHanako

Use as a benchmark for a rich desktop agent workbench:

- plugin marketplace;
- Desk async workspace;
- multi-agent channels;
- scheduled tasks;
- media/session files;
- mobile/LAN frontend;
- multi-provider onboarding;
- OS-level sandboxing.

Reference: https://github.com/liliMozi/openhanako

### Reasonix

Use as a benchmark for coding-agent kernel and desktop parity:

- planner/executor split;
- checkpoint/rewind;
- MCP tools/prompts/resources;
- `@file` and `@resource` references;
- slash commands;
- permissions/sandbox;
- cost/cache discipline.

Reference: https://github.com/esengine/DeepSeek-Reasonix

## UX Principles

- The first screen should be a usable workbench, not a landing page.
- A project should feel like a workspace with threads, files, terminals, browser previews, diffs, plans, and usage.
- Agents should be visible: current task, model role, cost, permissions, tools, and blockers.
- Risky actions should be guarded, auditable, and reversible.
- Browser and app control should always be visible and stoppable.
- English, Arabic, and Chinese should remain first-class UI languages.

## Candidate Pane System

OpenCodex Desktop should move toward a pane model:

- Chat/thread pane;
- Plan/tasks pane;
- Diff/review pane;
- File editor/preview pane;
- Terminal pane;
- Browser preview pane;
- Usage/cost pane;
- Agent/team status pane;
- MCP/skills diagnostics pane.

## Desktop Milestones

Phase 4:

- worktree/session isolation;
- diff/review pane;
- terminal tracking;
- checkpoint/rewind UI.

Phase 5:

- skills/MCP/plugin manager;
- config import/export;
- plugin diagnostics.

Phase 6:

- workflow commands;
- custom commands;
- `@file` and `@resource` context picker.

Phase 8:

- in-app browser;
- screenshots;
- annotations;
- local preview verification;
- appshots;
- guarded computer control.

Phase 9:

- team profiles;
- portable workspaces;
- mobile/LAN observer mode.
