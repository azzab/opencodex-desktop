# OpenCodex Desktop

**An independent open agent workbench. Not affiliated with OpenAI.**

OpenCodex Desktop is a local-first Electron workbench for serious agentic coding and operator workflows. It builds on the Kun runtime from DeepSeek GUI and broadens the product from a DeepSeek-centered desktop client into a multi-model, skills-aware, MCP-enabled agent workstation.

The product direction is simple: keep the speed, token discipline, and local persistence of Kun, then make the desktop app usable across any user's real project portfolio, including coding repos, SaaS products, automation tools, research workspaces, and agent-heavy operations.

## What It Is

OpenCodex Desktop is not another chat wrapper. It is a desktop environment for long-running coding and product work:

- bind a local workspace;
- talk to a capable local agent runtime;
- let the agent read, edit, test, and review files with visible approvals;
- reuse Skills and MCP tools across projects;
- route tasks across DeepSeek and OpenRouter-compatible models;
- track token usage, cache savings, and model cost;
- coordinate child agents when the work benefits from parallel review or research.

## Phase 0 Foundation

The first fork phase establishes the product identity:

- product name: **OpenCodex Desktop**;
- tagline: **An independent open agent workbench. Not affiliated with OpenAI.**;
- app slug: `opencodex-desktop`;
- upstream remote retained for future DeepSeek GUI updates;
- Arabic language support with RTL document direction;
- full documentation and notice files that explain independence, attribution, and secret-handling boundaries.

DeepSeek remains a supported model provider. It is no longer the product identity.

## User Agent Stack Import

The User Agent Stack Import profile will make the app useful across an existing project ecosystem. It is planned to import:

- global Codex skills from `~/.codex/skills`;
- project skills from `.codex/skills` and `.agents/skills`;
- Codex plugin cache skill roots;
- Claude Code and other compatible skill roots where available;
- MCP server definitions from Codex, Claude Code, and compatible config files with secret redaction;
- CLI availability checks for tools such as `codex`, `gh`, `hcloud`, `node`, `npm`, `git`, and `rg`.

This profile must persist into Kun config so both the Electron app and browser/dev mode share the same setup.

## Multi-Provider Models

OpenCodex Desktop keeps DeepSeek as the default provider and adds OpenRouter as a first-class option. The planned runtime reads OpenRouter's model catalog, including context length and pricing, then uses a real model picker instead of a fragile free-text field.

The `auto` model mode should route by task type, context need, tool support, reasoning need, and cost. Cost reporting must preserve Kun's existing token economy and cache telemetry. If a provider does not report cache hit/miss data, the UI should show that cache telemetry is unknown instead of pretending it is zero.

## Subagents And Swarm Workflows

Kun already has a `delegate_task` capability. OpenCodex Desktop will expose it safely through settings and workflow presets:

- review swarm;
- implementation split;
- research split;
- audit split.

Subagents should default to cheaper configured models when appropriate. Budgets for max parallel agents, max child runs, token cap, and cost cap protect the user from runaway work. Child-agent usage and cost should roll up into the parent thread.

The practical goal is controlled subagents, not an unbounded swarm.

## Phase 4 To Phase 10 Roadmap

OpenCodex Desktop will keep extending toward a near-Codex desktop workbench without giving up local control:

1. **Phase 4: Codex-Style Workspace Control** - repo trust, Git awareness, command policy, terminal tracking, and resumable handoffs.
2. **Phase 5: Skills, Plugins, And MCP Marketplace** - visible skill/MCP catalogs, local plugin profiles, import/export, and per-project overrides.
3. **Phase 6: Agentic Coding Workflow System** - planning, TDD, debugging, review, UI audit, release, and handoff workflows.
4. **Phase 7: Observability, Cost, And Token Economy** - provider costs, cache savings, budget warnings, exportable reports, and child-agent rollups.
5. **Phase 8: Browser, Computer Control, And App Automation** - local preview verification, screenshots, Electron smoke tests, and guarded computer-control flows.
6. **Phase 9: Team Profiles, Sync, And Portable Workspaces** - encrypted profile export/import, shared presets without secrets, and workspace policy files.
7. **Phase 10: Codex-Like Parity Target** - planning, editing, tool orchestration, model routing, subagents, verification, memory, handoff, and English/Arabic/Chinese polish.

## Arabic Support

Arabic support is a first-class product requirement. When Arabic is selected, the app should set `lang="ar"` and `dir="rtl"` on the document root. The initial Arabic locale focuses on the core settings and workbench language, with English fallback for untranslated strings until full translation coverage is complete.

## Upstream Strategy

OpenCodex Desktop should retain the original DeepSeek GUI repository as `upstream` so major Kun and packaging improvements can be reviewed and merged when useful. The fork should keep changes modular:

- product branding in a small set of constants and metadata;
- provider/catalog logic behind shared services;
- Skills/MCP imports behind a profile/import layer;
- subagent workflows behind Kun capabilities and settings.

This keeps future upstream updates possible without turning every pull into a rewrite.
