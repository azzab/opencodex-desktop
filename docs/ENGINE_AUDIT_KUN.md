# Kun Engine Audit

## Audit Question

Can Kun become the OpenCodex kernel?

Can Kun evolve into the OpenCodex kernel for a Codex-like desktop workbench?

## Current Audit Outcome

Yes. Kun should remain the single runtime/kernel for now.

The current repo already follows the critical boundary: Electron renderer and main process do not own the agent loop. The renderer uses a `KunRuntimeProvider` for HTTP/SSE calls and DTO mapping. Electron main starts or connects to `kun serve`, resolves the localhost base URL, applies auth headers, forwards `/v1/*` requests, and forwards thread SSE streams. Kun owns the runtime composition root, contracts, event recording, persistent stores, model client, approvals, user-input gates, tools, MCP, Skills, memory, attachments, usage, and subagent delegation.

That is the correct foundation for an OpenCodex kernel. The task is to mature Kun, not add another runtime beside it.

## Current Strengths

### Clear Runtime Boundary

Current architecture documents and source show a single local HTTP/SSE boundary:

```text
Renderer -> preload/main IPC -> Electron main runtime host -> Kun HTTP/SSE -> Kun services/loop/tools
```

This keeps agent behavior out of React state and gives the desktop shell a stable contract.

### Composition Root And Ports/Adapters Shape

`kun/src/server/runtime-factory.ts` wires the runtime through injected stores, gates, event bus, model client, tool providers, memory, Skills, MCP, web tools, attachment store, and delegation runtime. This is the right place to add future kernel capabilities because it avoids renderer-owned agent logic.

### Persistent Event And Usage Model

`RuntimeEventRecorder` stamps, validates, publishes, and persists events for SSE replay. Runtime projections include turns, items, usage, child runs, compactions, tool-catalog changes, and errors. This supports resumable desktop workflows and auditability.

### Skills, MCP, Memory, Attachments, And Subagents Already Exist As Runtime Concepts

Kun already has capability manifests and runtime paths for Skills, MCP, web, memory, attachments, and subagents. The renderer exposes these through typed contracts and diagnostics. This is stronger than a chat wrapper because these are kernel capabilities, not just UI labels.

### Cache-First Token Economy

Kun has a stable system prompt, immutable-prefix discipline, model context profiles, context compaction settings, token economy settings, request-history hygiene, tool storm suppression, and DeepSeek cache-hit/miss telemetry. That aligns with a long-running local agent workbench.

### Upstream-Friendly Single Runtime

The current DeepSeek GUI/Kun direction already removed old switchable runtime surfaces. Keeping Kun as the only runtime preserves the upstream sync path better than reintroducing CodeWhale, Reasonix, or another engine as a parallel provider.

## Likely Gaps

### Provider And Model Registry

Kun currently has DeepSeek-compatible defaults and model profiles, but the OpenCodex kernel needs a fuller provider registry:

- provider IDs and base URLs;
- OpenRouter catalog import;
- context length and pricing metadata;
- capability flags for tools, images, reasoning, cache telemetry, and streaming;
- model roles such as primary, planner, reviewer, cheap child, utility, and vision;
- task-aware routing by context, cost, reasoning need, and tool support.

### Planner/Executor And Goal Modes

Kun supports goals, todos, plan surfaces, review, steering, and compaction concepts, but Codex-like parity needs kernel-level planning modes:

- read-only planning;
- explicit transition from plan to mutation;
- planner/executor role separation;
- resumable `/goal` state;
- task state that survives app restart;
- phase handoff summaries that do not depend on chat history.

### Checkpoint And Rewind

The current architecture has persisted events and fork/resume paths, but a Codex-like workbench needs explicit checkpoint semantics:

- checkpoint before mutating turns;
- restore code only;
- restore conversation only;
- restore both;
- fork from checkpoint;
- never rely on destructive git commands as the only rewind mechanism.

### Permissions And Sandbox Enforcement

Approval policy and sandbox mode exist, but future work must prove stronger enforcement:

- allow/ask/deny policy per tool and workspace;
- command allowlist and denylist;
- path confinement with symlink and parent-directory escape protection;
- privileged operation approvals;
- OS-level sandbox composition where available;
- audit events for every meaningful mutation.

### Desktop Workbench Surfaces

The kernel has useful contracts, but the desktop app must expose them clearly:

- workspace/project switcher;
- file and diff panel;
- terminal panel;
- browser preview panel;
- task/plan/subagent status;
- MCP/Skills visibility and diagnostics;
- provider/model/cost/cache telemetry;
- approvals and audit logs.

### Browser And Computer Control

Kun does not yet appear to have full in-app browser automation or computer-control contracts. These should be added through typed tools and sidecars, not renderer-only scripts.

### Multi-Language Product Surface

English, Arabic, and Chinese are present in renderer i18n resources. Future work must preserve all three during the rebrand and avoid treating Chinese as disposable upstream residue.

## No Casual Second Runtime

OpenCodex Desktop must not add a second live agent runtime casually.

A second runtime creates duplicated session state, duplicated approvals, split usage telemetry, inconsistent tool safety, harder upstream merges, and unclear user trust boundaries. It also weakens the core product decision: Kun is the OpenCodex kernel until proven otherwise.

New capabilities should first attempt this path:

1. define or extend Kun contracts;
2. implement in Kun services, loop, ports, adapters, or tools;
3. expose through Kun HTTP/SSE routes;
4. map in the renderer `kun-runtime`/`kun-mapper` layer;
5. show in Electron UI with permissions, audit, and telemetry.

## What Must Be Proven Before Replacing Kun

Replacing Kun requires written evidence, not preference. A future audit must prove at least one hard blocker:

- Kun cannot support provider/model registries and role-based model routing without destabilizing the runtime.
- Kun cannot enforce workspace, command, or tool permissions safely enough for desktop agent work.
- Kun cannot implement checkpoint/rewind or fork/resume semantics without corrupting sessions or user files.
- Kun cannot host MCP, Skills, memory, browser, or subagent capabilities with observable contracts and acceptable performance.
- Kun's HTTP/SSE boundary becomes a measured reliability bottleneck that cannot be fixed by contract or transport improvements.
- The upstream merge path becomes impossible because required OpenCodex kernel changes cannot be isolated cleanly.

Evidence should include source-level analysis, failing experiments, measured runtime behavior, migration cost, and a replacement plan with parity for sessions, events, approvals, usage, Skills, MCP, memory, subagents, and locale support.

## Decision

Proceed with Kun as the OpenCodex kernel. Phase 1 should extend the existing runtime rather than introduce a parallel engine. Revisit replacement only after concrete blockers are proven by implementation evidence in later phases.
