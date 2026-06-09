# Phase 3 Subagents And Swarm Workflows Spec

Date: 2026-06-09

## Goal

Enable controlled subagent and swarm workflows through Kun's existing
`delegate_task` tool. Kun remains the only execution kernel, and the desktop UI
only configures, displays, and monitors the runtime contract.

## Source-Of-Truth Reads

- `docs/AGENTS.md`: keep one live Kun runtime, store settings under
  `agents.kun`, and extend Kun contracts before renderer UI.
- `docs/ENGINE_AUDIT_KUN.md`: subagents already exist as a Kun runtime concept;
  new workflow behavior belongs in contracts, loop/services, routes, renderer
  mappers, and telemetry.
- `docs/REFERENCE_INTAKE.md`: borrowed agent-team ideas must map to a Kun
  contract, permission/audit/telemetry behavior, and tests.
- SaaS Foundry Constitution and matrix docs for desktop agent apps, agent
  surfaces, security/audit, observability, and subagent workflow prompts.
- Phase 1 and Phase 2 specs: keep settings under `agents.kun`, preserve
  redaction, model catalog/pricing, cache telemetry, and single-runtime behavior.

## Runtime Contract

`capabilities.subagents` is the single source of truth for whether
`delegate_task` is advertised and executable. It carries:

- `enabled`;
- cheap child `defaultModel`, defaulting to `deepseek-v4-flash`;
- `defaultPreset`;
- hard budgets: `maxParallel`, `maxChildRuns`, `maxTotalChildTokens`,
  `maxChildCostUsd`, and `perAgentTimeoutMs`;
- workflow presets: `review_swarm`, `implementation_split`, `research_split`,
  and `audit_split`.

The renderer persists the same shape under `agents.kun.subagents`; Electron main
syncs it into `<dataDir>/config.json`; Kun parses and enforces it.

## Budget And Threat Design

Subagent execution is risky because each child run creates another model loop
with tools, context prefix cost, cache behavior, and possible file access. The
lead-parent thread must keep control.

Controls:

- disabled settings remove `delegate_task` from the tool registry;
- child runs default to the cheap child model unless the tool call explicitly
  requests a model;
- child runs are denied before dispatch when parallel, run-count, token, or cost
  budgets are already exhausted;
- each child gets a timeout-controlled abort signal;
- completed child usage is folded into the parent thread usage and emitted as a
  normal Kun usage event;
- if a completed child pushes aggregate child tokens or cost over the configured
  maximum, Kun records a budget-stop error and denies later children;
- child records persist in the Kun data directory for replay and diagnostics.

No renderer state, MCP adapter, or external agent process can bypass these
checks.

## Workflow Presets

Presets are small policy bundles, not a second workflow engine:

- `review_swarm`: bounded parallel review lanes with low mutation expectation.
- `implementation_split`: fewer children, longer timeout, still cheap by default.
- `research_split`: more child runs, lower cost ceiling, read/research oriented.
- `audit_split`: broad inspection lanes with moderate token budget.

`delegate_task` accepts an optional `preset`. The runtime applies the preset's
model and budgets for that child run while still counting against the parent
thread's persisted child-run history.

## Usage, Cost, Cache, And Summaries

Every child run records:

- status, label, preset, model, timestamps, summary, and error;
- usage tokens, cache hit/miss telemetry, cache savings, and cost;
- parent thread and parent turn ids.

Parent aggregation is exposed through runtime diagnostics and usage events:

- parent `/v1/usage` includes child usage and cost;
- diagnostics include child run list, aggregate usage, and aggregate summaries;
- SSE child lifecycle events carry child metadata so the UI can show live
  collapsible trace/status rows.

## UI

Settings > AI assistant adds a Subagents section:

- enable/disable toggle;
- default child model field;
- default workflow preset selector;
- numeric budget controls for parallel agents, child runs, total child tokens,
  child cost, and timeout;
- preset visibility in diagnostics.

The chat timeline renders child lifecycle events as collapsible process rows
with status, label, model/preset, summary/error, and usage/cost/cache metadata.

## Tests

- Unit tests: capability parsing, settings normalization, config sync, and
  budget enforcement.
- Integration tests: mock child delegation through `delegate_task`, timeout, and
  hard-stop behavior.
- Usage aggregation tests: child usage folds into parent usage and diagnostics.
- Renderer tests: settings controls render without secrets, and child run events
  render trace/status rows.

