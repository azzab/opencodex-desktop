# OpenCodex Desktop

**An independent open agent workbench. Not affiliated with OpenAI.**

OpenCodex Desktop is a fork and rebrand of [DeepSeek GUI](https://github.com/XingYu-Zhong/DeepSeek-GUI). It keeps the Kun local runtime architecture and expands the product into a multi-model, Skills-aware, MCP-enabled desktop agent workbench for real project work.

DeepSeek remains a supported default model provider. It is no longer the product identity.

## Why This Fork Exists

OpenCodex Desktop is designed for users who run many local projects and want one durable agent workstation across them. The immediate target is any developer, founder, operator, or team that already has useful agent settings spread across tools such as Codex, Claude Code, Cursor, OpenCode, MCP configs, shell profiles, and project-local skill folders.

The goal is to make the desktop app feel closer to a local Codex-style operating environment:

- project-aware workspaces;
- reusable Skills;
- MCP tools;
- CLI availability;
- DeepSeek and OpenRouter model routing;
- token and cost accounting;
- Arabic UI support;
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

### Phase 0: Fork, Rebrand, Arabic Foundation

Phase 0 establishes identity and documentation:

- product name: **OpenCodex Desktop**;
- app slug: `opencodex-desktop`;
- tagline: **An independent open agent workbench. Not affiliated with OpenAI.**;
- Arabic locale support;
- RTL document direction for Arabic;
- detailed README, landing document, and notice;
- upstream strategy for future DeepSeek GUI updates.

### Phase 1: User Agent Stack Import

The User Agent Stack Import profile will make the app usable across any user's existing local projects and agent setup.

Planned imports:

- global Codex Skills from `~/.codex/skills`;
- project Skills from `.codex/skills`;
- project Skills from `.agents/skills`;
- Codex plugin cache Skill roots;
- Claude Code and other compatible skill roots where available;
- MCP server definitions from Codex, Claude Code, and compatible config files, with secret redaction;
- CLI availability for `codex`, `gh`, `hcloud`, `node`, `npm`, `git`, `rg`, and related tools.

The profile should persist through Kun config so the packaged Electron app and browser/dev mode use the same setup.

### Phase 2: Multi-Provider Model Runtime

OpenCodex Desktop keeps DeepSeek as the default provider and adds OpenRouter as a first-class provider.

Planned model runtime work:

- OpenRouter provider profile with `https://openrouter.ai/api/v1`;
- model catalog refresh from OpenRouter's `/models` endpoint;
- context length and pricing metadata;
- model picker instead of a free-text model field;
- `auto` routing across configured models;
- task-aware routing by coding, debugging, review, research, context size, tool support, reasoning need, and cost;
- cost calculation for OpenRouter models;
- preservation of Kun token economy and DeepSeek cache telemetry.

When a provider does not report cache hit/miss data, the UI should report unknown cache telemetry rather than pretending the cache hit rate is zero.

### Phase 3: Subagents And Swarm Workflows

Kun already exposes a `delegate_task` capability. OpenCodex Desktop will surface it safely.

Planned controls:

- enable or disable subagents;
- default cheaper child model;
- max parallel agents;
- max child runs;
- token cap;
- cost cap;
- workflow presets for review swarm, implementation split, research split, and audit split.

The product goal is controlled subagents, not an unbounded swarm. Child-agent usage and cost should roll up into parent thread usage.

### Phase 4: Codex-Style Workspace Control

OpenCodex Desktop should add a stronger project control surface:

- workspace onboarding with repo trust boundaries;
- Git status, branch, and diff awareness;
- guarded file read/write permissions;
- command allowlists and denylists;
- terminal session tracking;
- test/build command discovery;
- handoff summaries that can restart work without chat history.

### Phase 5: Skills, Plugins, And MCP Marketplace

The app should make reusable capabilities visible instead of hidden in dotfiles:

- skill browser with source, scope, triggers, and enablement state;
- MCP server browser with redacted environment variables;
- local plugin registry;
- import/export for user profiles;
- compatibility diagnostics for Codex, Claude Code, and MCP conventions;
- per-project overrides that do not mutate global config without permission.

### Phase 6: Agentic Coding Workflow System

OpenCodex Desktop should support repeatable coding workflows:

- plan-first execution;
- TDD task loops;
- review-before-merge flows;
- bug forensics and systematic debugging flows;
- UI audit flows;
- release and deployment checklists;
- Markdown handoff prompts for opening fresh agent windows.

### Phase 7: Observability, Cost, And Token Economy

The usage layer should become a real operator dashboard:

- provider-level token and cost reporting;
- cache reads, cache writes, and estimated cache savings;
- per-thread, per-project, and per-model cost views;
- budget warnings;
- exportable usage reports;
- child-agent cost aggregation;
- unknown telemetry states when a provider does not expose cache details.

### Phase 8: Browser, Computer Control, And App Automation

The workbench should support guarded GUI automation:

- browser preview and screenshot verification;
- local web app smoke tests;
- Electron app smoke tests;
- accessibility checks for core flows;
- computer-control workflows behind explicit permissions;
- durable automation logs.

### Phase 9: Team Profiles, Sync, And Portable Workspaces

The app should let users carry their setup across machines and teams:

- encrypted profile export/import;
- team-safe shared presets without secrets;
- project templates;
- per-workspace policy files;
- deterministic bootstrap checks;
- offline-first sync boundaries.

### Phase 10: Codex-Like Parity Target

The long-term target is to reach roughly 99% of the local Codex-style desktop experience while staying independent:

- rich planning and execution modes;
- fast codebase search and editing;
- tool and MCP orchestration;
- model routing;
- subagents;
- browser/app verification;
- cost controls;
- durable memory and handoff;
- English, Arabic, and Chinese UI quality;
- clean upstream merge discipline.

## Arabic Support

Arabic is a first-class product requirement. When Arabic is selected, the app sets:

```html
<html lang="ar" dir="rtl">
```

The initial Arabic locale focuses on core workbench and settings strings. English fallback remains active for untranslated strings until full translation coverage is complete.

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

OpenCodex Desktop is an independent fork and rebrand of DeepSeek GUI by XingYu-Zhong and contributors.

Original upstream:

https://github.com/XingYu-Zhong/DeepSeek-GUI

OpenAI, Codex, DeepSeek, and related marks belong to their respective owners. OpenCodex Desktop is not affiliated with OpenAI.

## License

This fork preserves the upstream license. See [LICENSE](LICENSE).
