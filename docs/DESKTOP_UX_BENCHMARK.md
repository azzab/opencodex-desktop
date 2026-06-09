# Desktop UX Benchmark

## Position

The desktop app is the selling point.

The desktop app is the product surface. OpenCodex Desktop should feel like a local command center for agentic coding and operator work, not a web chat wrapped in Electron.

Codex-like quality means the user can bind a project, start a goal, see what the agent is doing, inspect file changes, run or observe terminal work, verify browser/app behavior, manage tools and model spend, and resume later without reconstructing context from chat memory.

## Target-Class Workflow Comparison

| Workbench Area | Desired OpenCodex Desktop Experience | Codex-Like Quality Bar |
|---|---|---|
| Workspace/project switching | Fast project switcher with trust status, repo metadata, recent threads, active goals, and per-project config. | Threads and tools are clearly connected to a workspace; the user can tell what repo is active before any mutation. |
| Model/provider surfaces | Provider/model picker with roles, capabilities, context length, cost metadata, cache telemetry state, and safe unknown states. | The user sees why a model is selected and what it may cost; unsupported telemetry is not faked. |
| File panel | Read, search, open, and attach files with project boundary visibility. | The agent can cite current files and the user can inspect them without leaving the workbench. |
| Diff/review panel | Human-readable diffs, changed-file list, inline review notes, and accept/reject workflows. | Mutations are visible, attributable, and reversible. |
| Terminal panel | Managed terminal sessions with cwd, command history, running state, exit codes, and approval boundaries. | Commands are observable and risky commands are gated. |
| Browser panel | In-app browser preview for localhost and external targets, console/network capture, screenshots, annotations, and evidence attachments. | Browser verification is visible and can be stopped by the user. |
| Task state | Goal, plan, todos, current turn, blockers, approvals, and handoff summary survive restarts. | Long-running work has explicit state, not only a transcript. |
| Subagents | Child runs are opt-in, budgeted, labeled, observable, and rolled up into parent usage. | Parallel work is controlled, not an unbounded swarm. |
| Cost/cache telemetry | Per-thread, per-project, per-model tokens, cost, cache hit/miss, savings, and unknown telemetry states. | The user can see spend and cache behavior from runtime evidence. |
| MCP/Skills visibility | Skill roots, active skills, MCP servers, tool counts, diagnostics, and redacted config are visible. | Tools are discoverable and explainable before the agent uses them. |
| Permissions/audit | Approval history, mutation log, tool policy, and emergency stop controls are visible. | Risk is managed through UI, not hidden in model behavior. |

## Primary Benchmarks

### Codex

Use Codex as the capability compass for:

- goal-driven long-running work;
- project-connected threads;
- file editing and review;
- multi-agent orchestration;
- Skills and reusable workflows;
- browser/app verification;
- computer-use/app-context workflows;
- cost and task-state visibility.

This is a quality benchmark only. OpenCodex Desktop remains independent and unaffiliated with OpenAI.

### Claude Code And Claude Code Desktop

Use Claude Code as a workflow benchmark for:

- local project trust boundaries;
- terminal-native developer ergonomics;
- worktrees and parallel sessions;
- visible diffs and side chats;
- app previews;
- connectors;
- controlled computer use.

This is a workflow benchmark only. OpenCodex Desktop remains independent and unaffiliated with Anthropic.

## Secondary Benchmarks

- OpenHanako: plugin marketplace, workspace/Desk model, multi-agent channels, scheduled tasks, app context, sandboxing, and permission tiers.
- Reasonix: planner/executor split, checkpoint/rewind, slash commands, references, MCP, permissions, and cache-first coding-agent kernel ideas.
- Crest: side-by-side agent desktop workflows.
- cdesktop: agent teams, routines, worktrees, previews, diffs, and PR workflows.
- Olenro: config/profile management across providers, MCP, skills, hooks, rules, and agents.
- OpenCode: terminal/CLI coding-agent workflows and provider flexibility.
- Goose: local extensibility, tools, and agent/operator surfaces.
- Aider: Git-centered pair-programming, diff discipline, and repo-local coding loop.

## Pane Model Direction

OpenCodex Desktop should move toward a flexible pane system:

- Chat/thread pane;
- Goal/plan/todos pane;
- File tree and editor/preview pane;
- Diff/review pane;
- Terminal pane;
- Browser preview and evidence pane;
- MCP/Skills diagnostics pane;
- Provider/model settings pane;
- Usage/cost/cache telemetry pane;
- Subagent/team status pane;
- Permissions and audit log pane.

The first screen should be a usable workbench with a clear active workspace, not a marketing landing page.

## Desktop Requirements For Future Phases

Phase 1 should establish import and visibility for the User Agent Stack: Skills, MCP configs, CLIs, project roots, and safe redaction.

Phase 2 should make model/provider selection explicit and cost-aware.

Phase 3 should surface controlled subagents with budgets and parent rollups.

Phase 4 should add stronger workspace control: Git status, branch/diff awareness, command policy, terminal tracking, checkpoints, and handoffs.

Phase 5 should expose Skills, plugins, MCP, and profile import/export as visible workbench surfaces.

Phase 6 should add repeatable workflow commands for planning, TDD, review, debugging, UI audit, release, and handoff.

Phase 7 should make observability and cost/cache telemetry an operator dashboard.

Phase 8 should add browser automation, app evidence, screenshots, annotations, and guarded computer-control prototypes.

## Language And Accessibility Requirements

English, Arabic, and Chinese must remain first-class UI languages. Arabic flows require RTL layout checks. Chinese strings inherited from the upstream foundation must not be removed as part of the rebrand. Desktop panels must be keyboard navigable, readable at small widths, and explicit about loading, empty, error, blocked, and success states.
