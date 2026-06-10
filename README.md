# OpenCodex Desktop

**An independent open agent workbench. Not affiliated with OpenAI.**

OpenCodex Desktop is an independent fork and rebrand of [DeepSeek GUI](https://github.com/XingYu-Zhong/DeepSeek-GUI) by XingYu-Zhong and contributors. It keeps the Kun local runtime architecture and expands the product into a multi-model, Skills-aware, MCP-enabled desktop agent workbench for real project work.

DeepSeek remains a supported default model provider. It is no longer the product identity.

OpenCodex Desktop is not only inspired by DeepSeek GUI. DeepSeek GUI/Kun is the fork foundation; Codex is the product compass. The roadmap also studies Claude Code Desktop, Reasonix, OpenHanako, Crest, cdesktop, Olenro, OpenCode, Goose, Aider, and similar agent systems as benchmarks for desktop UX, coding-agent kernels, Skills, MCP, model routing, browser automation, and computer-control workflows.

## Why This Fork Exists

OpenCodex Desktop is designed for users who run many local projects and want one durable agent workstation across them. The immediate target is any developer, founder, operator, or team that already has useful agent settings spread across tools such as Codex, Claude Code, Cursor, OpenCode, MCP configs, shell profiles, and project-local skill folders.

The goal is to make the desktop app feel closer to a local Codex-style operating environment:

- project-aware workspaces;
- reusable Skills;
- MCP tools;
- CLI availability;
- DeepSeek and OpenRouter model routing;
- token and cost accounting;
- English, Arabic, and Chinese UI support;
- controlled subagents and swarm workflows.

## Current Foundation

This fork starts from DeepSeek GUI `v0.2.7` and preserves Kun as the single runtime.

Kun is the local HTTP/SSE agent runtime shipped under `kun/`. The renderer talks to the main process, the main process starts or connects to Kun, and Kun owns the agent loop, tools, usage telemetry, approvals, threads, and runtime capabilities.

```text
Renderer (React)
  -> preload bridge
  -> Electron main process
  -> Kun HTTP/SSE runtime
  -> cache-first agent loop
```

This matters because OpenCodex Desktop should not add a second agent runtime. New capabilities should be added through Kun contracts, config, adapters, and settings.

## Phase Roadmap

Paste-ready phase launchers are stored under
[docs/prompts](docs/prompts/README.md). Each prompt includes the recommended
GPT version, reasoning level, deliverables, guardrails, and verification gates
for a fresh agent window.

### Phase 0: Fork, Rebrand, Arabic Foundation

Phase 0 establishes identity and documentation:

- product name: **OpenCodex Desktop**;
- app slug: `opencodex-desktop`;
- tagline: **An independent open agent workbench. Not affiliated with OpenAI.**;
- English, Arabic, and Chinese locale support;
- RTL document direction for Arabic;
- detailed README, landing document, and notice;
- upstream strategy for future DeepSeek GUI updates.

### Phase 0.5: Codex-Parity Reference And Engine Plan

Phase 0.5 is a docs-only planning gate before deeper implementation:

- Codex-parity reference intake;
- Kun engine audit;
- desktop UX benchmark;
- browser and computer-control feasibility plan;
- public clarification that OpenCodex Desktop is an independent workbench benchmarked against multiple modern agent systems, not only a DeepSeek GUI rebrand.

Read:

- [docs/PHASE_0_5_GOAL.md](docs/PHASE_0_5_GOAL.md)
- [docs/REFERENCE_INTAKE.md](docs/REFERENCE_INTAKE.md)
- [docs/ENGINE_AUDIT_KUN.md](docs/ENGINE_AUDIT_KUN.md)
- [docs/DESKTOP_UX_BENCHMARK.md](docs/DESKTOP_UX_BENCHMARK.md)
- [docs/BROWSER_COMPUTER_CONTROL_PLAN.md](docs/BROWSER_COMPUTER_CONTROL_PLAN.md)

### Phase 1: User Agent Stack Import

The User Agent Stack Import profile will make the app usable across any user's existing local projects and agent setup.

Current imports:

- global Codex Skills from `~/.codex/skills`;
- project Skills from `.codex/skills`;
- project Skills from `.agents/skills`;
- Codex plugin cache Skill roots;
- user Skills from `~/.agents/skills`;
- MCP server definitions from Codex/user config files, with secret redaction;
- CLI availability for `codex`, `gh`, `hcloud`, `node`, `npm`, `pnpm`, `bun`, `git`, `docker`, `python`, `uv`, `npx`, `playwright`, and common agent CLIs when present.

The profile should persist through Kun config so the packaged Electron app and browser/dev mode use the same setup.

Open Settings -> AI assistant -> User Agent Stack to refresh a redacted preview or import the profile. The imported profile is stored under `agents.kun.userAgentStack`; GUI-managed Kun config sync then writes available skill roots and redacted MCP server definitions into `<dataDir>/config.json`.

The preview and persisted profile are intentionally display/export-safe. Secret-like environment variables, authorization headers, token query parameters, passwords, API keys, and command arguments following secret flags are replaced with `<redacted>`.

Read:

- [docs/PHASE_1_USER_AGENT_STACK_SPEC.md](docs/PHASE_1_USER_AGENT_STACK_SPEC.md)
- [docs/PHASE_1_VERIFICATION_REPORT.md](docs/PHASE_1_VERIFICATION_REPORT.md)

### Phase 2: Multi-Provider Model Runtime

OpenCodex Desktop keeps DeepSeek as the default provider and adds OpenRouter as a first-class provider.

Implemented model runtime support:

- OpenRouter provider profile with `https://openrouter.ai/api/v1`;
- model catalog refresh from OpenRouter's `https://openrouter.ai/api/v1/models` endpoint;
- context length, tokenizer, capability, and input/output/cache pricing metadata;
- model picker instead of a free-text model field;
- `auto` routing across configured models;
- task-aware routing by coding, debugging, review, research, context size, tool support, reasoning need, and cost;
- cost calculation for OpenRouter models;
- preservation of Kun token economy and DeepSeek cache telemetry.

When a provider does not report cache hit/miss data, the UI should report unknown cache telemetry rather than pretending the cache hit rate is zero.

Read:

- [docs/PHASE_2_MULTI_PROVIDER_MODEL_RUNTIME_SPEC.md](docs/PHASE_2_MULTI_PROVIDER_MODEL_RUNTIME_SPEC.md)
- [docs/PHASE_2_VERIFICATION_REPORT.md](docs/PHASE_2_VERIFICATION_REPORT.md)

### Phase 3: Subagents And Swarm Workflows

Kun already exposes a `delegate_task` capability. OpenCodex Desktop surfaces it through guarded settings and runtime budgets.

Implemented controls:

- enable or disable subagents;
- default cheaper child model;
- max parallel agents;
- max child runs;
- token cap;
- cost cap;
- workflow presets for review swarm, implementation split, research split, and audit split.

The product goal is controlled subagents, not an unbounded swarm. Child-agent usage and cost should roll up into parent thread usage.

Read:

- [docs/PHASE_3_SUBAGENTS_SWARM_SPEC.md](docs/PHASE_3_SUBAGENTS_SWARM_SPEC.md)
- [docs/PHASE_3_VERIFICATION_REPORT.md](docs/PHASE_3_VERIFICATION_REPORT.md)

### Phase 3.5: Goal, Loop, And Automations

OpenCodex Desktop should add independent `/goal` and `/loop` equivalents:

- `/goal` is condition-driven continuation toward a measurable done state;
- `/loop` is scheduled recurring prompts, not infinite continuation;
- goal evaluators should be tool-free and budgeted;
- scheduled work should have list, cancel, expiry, resume, and usage accounting;
- automations must not bypass permissions, budgets, approvals, or audit events.

Current state: goal-style continuation exists in the Kun loop, but the full tool-free evaluator and `/loop` scheduler are not proven complete.

Read:

- [docs/prompts/PHASE_3_5_GOAL_LOOP_AUTOMATIONS.md](docs/prompts/PHASE_3_5_GOAL_LOOP_AUTOMATIONS.md)

### Phase 4: Browser Automation And Computer Control Foundation

OpenCodex Desktop has a disabled-by-default automation foundation:

- automation settings under `agents.kun.automation`;
- local/dev host limits;
- permission gates for navigation, click/type, screenshots, local file access, and app control;
- app/computer control denied in the foundation phase;
- Kun automation contracts, permission service, audit events, sidecar port, and mock/no-op adapter;
- Settings controls for experimental automation and audit-log limits.

This phase does not prove real browser control, screenshots, DOM/network evidence, external Chrome automation, or OS-level computer control.

Read:

- [docs/PHASE_4_BROWSER_AUTOMATION_SECURITY_SPEC.md](docs/PHASE_4_BROWSER_AUTOMATION_SECURITY_SPEC.md)
- [docs/PHASE_4_VERIFICATION_REPORT.md](docs/PHASE_4_VERIFICATION_REPORT.md)
- [docs/BROWSER_COMPUTER_CONTROL_PLAN.md](docs/BROWSER_COMPUTER_CONTROL_PLAN.md)

### Phase 4.5: Remote Relay And Mobile Access

OpenCodex Desktop needs a separate remote/mobile design that does not rely on the legacy Chinese IM infrastructure inherited from the upstream fork:

- mobile and browser clients are control surfaces;
- the desktop host owns files, projects, Kun, MCP, Skills, provider credentials, browser sessions, and computer-control permissions;
- relay services handle identity, pairing, routing, presence, push, and minimal metadata;
- host connection should be outbound-only;
- OAuth/OIDC login and device-pairing flows should be documented before implementation;
- relay must not store source code, raw terminal output, browser cookies, MCP secrets, screenshots by default, or provider credentials.

Read:

- [docs/prompts/PHASE_4_5_REMOTE_RELAY_MOBILE_ACCESS.md](docs/prompts/PHASE_4_5_REMOTE_RELAY_MOBILE_ACCESS.md)

### Phase 5: Codex-Like Desktop Workbench UX

OpenCodex Desktop should expose the actual workbench as the first screen:

- active project and trust state;
- thread, goal, plan, and todo state;
- files, search, and attachments;
- diff/review surface;
- terminal state;
- browser/evidence surface;
- Skills, MCP, provider/model, subagent, usage/cost/cache, and permission diagnostics.

### Phase 6: Git, Worktrees, Handoff, And Review

OpenCodex Desktop should add safer Git and worktree workflows:

- Git status, branch, and diff awareness;
- managed worktrees for background tasks;
- safe handoff between local and worktree sessions;
- stage/revert by file or hunk with destructive-action confirmation;
- commit, push, and PR preparation behind explicit user action;
- handoff summaries that can restart work without chat history.

### Phase 7: Skills, Plugins, Hooks, Rules, And Memory

The app should make reusable capabilities visible and controllable instead of hidden in dotfiles:

- skill browser with source, scope, triggers, and enablement state;
- MCP server browser with redacted environment variables;
- local plugin registry;
- import/export for user profiles;
- hook lifecycle and trust review;
- user/project rules and memory visibility;
- compatibility diagnostics for Codex, Claude Code, and MCP conventions;
- per-project overrides that do not mutate global config without permission.

### Phase 8: App Server, CLI Bridge, And IDE Bridge

OpenCodex Desktop should expose one shared protocol for all clients:

- Electron desktop;
- local CLI;
- IDE extension;
- mobile/browser control surfaces;
- remote relay clients.

The app-server protocol should cover projects, threads, turns, streamed events, approvals, artifacts, goals, loops, subagents, automation, and usage through the same Kun kernel.

### Phase 9: Remote Runners, SSH Hosts, And Optional Cloud Workers

OpenCodex Desktop should support safe remote execution options after the local kernel and app-server protocol are stable:

- local desktop runner;
- SSH host runner;
- optional cloud worker;
- capability handshake;
- remote workspace trust model;
- credential redaction;
- approval, budget, audit, stop, resume, and reconnect semantics.

Current Phase 9 foundation: `docs/REMOTE_RUNNER_PROTOCOL.md` and
`src/shared/remote-runner-protocol.ts` define the runner handshake, SSH host
config references, data egress policy, budget/approval/audit requirements, and
stop/resume/reconnect messages. No SSH connector, cloud worker, public listener,
or remote command execution path is implemented yet.

### Phase 10: Parity Hardening, Security, And Release

The long-term target is to reach a near-Codex local desktop experience while staying independent:

- evidence-backed parity matrix;
- security review for renderer, IPC, secrets, MCP, browser/computer control, remote/mobile, hooks, plugins, and updater;
- localization review for English, Arabic RTL, and Chinese;
- packaging and update-channel review;
- release-readiness report before any publish.

## Language Support

English, Arabic, and Chinese are first-class product requirements. When Arabic is selected, the app sets:

```html
<html lang="ar" dir="rtl">
```

The initial Arabic locale focuses on core workbench and settings strings. Chinese support inherited from DeepSeek GUI/Kun remains supported. English fallback remains active for untranslated strings until full translation coverage is complete.

## Upstream Strategy

This fork should keep a clean relationship with the original DeepSeek GUI repository.

Recommended Git remotes:

```bash
git remote rename origin upstream
git remote add origin git@github.com:<your-account>/opencodex-desktop.git
git fetch upstream
```

Use `upstream` for major DeepSeek GUI updates and `origin` for OpenCodex Desktop development.

Expected workflow:

```bash
git fetch upstream
git checkout main
git merge upstream/master
```

Review upstream changes before merging. Kun runtime updates, packaging fixes, and security patches are useful candidates. Product identity, provider strategy, Arabic support, and User Agent Stack behavior belong to this fork.

## Safety And Secret Handling

OpenCodex Desktop must not write secrets into docs, tests, config snapshots, logs, screenshots, or model prompts.

Never include:

- API keys;
- OAuth tokens;
- `.env` values;
- private customer data;
- private infrastructure details;
- raw provider payloads containing credentials.

When importing Codex MCP configuration, copy server IDs, commands, transport, and safe schema. Redact or skip secret values.

## Development

Install dependencies:

```bash
npm install
```

Run the app in development:

```bash
npm run dev
```

Build the renderer, main process, and Kun runtime:

```bash
npm run build
```

Run checks:

```bash
npm run typecheck
npm test
```

Build packages:

```bash
npm run dist:mac
npm run dist:win
npm run dist:linux
```

## Important Architecture Rule

DeepSeek GUI's repo instructions still apply to this fork unless deliberately changed:

- Kun is the only live runtime.
- Do not add a second provider/runtime process path.
- Settings should live under `agents.kun`.
- UI, CLI, MCP, and API surfaces should call shared services/contracts rather than duplicating business logic.

Read:

- [docs/AGENTS.md](docs/AGENTS.md)
- [kun/README.md](kun/README.md)
- [docs/kun-architecture.md](docs/kun-architecture.md)
- [LANDING.md](LANDING.md)
- [NOTICE.md](NOTICE.md)

## Attribution

OpenCodex Desktop began as a fork of DeepSeek GUI and its Kun runtime by XingYu-Zhong and contributors. That upstream work remains the technical foundation for this project.

Original upstream:

https://github.com/XingYu-Zhong/DeepSeek-GUI

OpenCodex Desktop is now an independent agent workbench project benchmarked against modern agent systems including Codex, Claude Code, Reasonix, OpenHanako, Crest, cdesktop, Olenro, OpenCode, Goose, and Aider.

OpenAI, Codex, DeepSeek, Anthropic, Claude, OpenRouter, DeepSeek GUI, Reasonix, OpenHanako, Crest, cdesktop, Olenro, OpenCode, Goose, Aider, and related marks belong to their respective owners. OpenCodex Desktop is not affiliated with, endorsed by, or sponsored by those projects or companies.

## License

This fork preserves the upstream license. See [LICENSE](LICENSE).
