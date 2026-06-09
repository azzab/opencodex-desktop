# Phase 0.5 Goal: Codex-Parity Reference And Engine Plan

Also known as: Codex-Parity Reference Intake And Engine Direction.

## Paste-Ready Phase Launcher

```text
/goal Phase 0.5: Codex-Parity Reference Intake and Engine Direction

Mode: Docs-only strategy, source review, architecture audit
Work from: OpenCodex Desktop

Objective:
Create the written foundation for OpenCodex Desktop before Phase 1 implementation. Codex is the quality and capability compass, but OpenCodex Desktop remains an independent open agent workbench and is not affiliated with OpenAI. DeepSeek GUI/Kun is the fork foundation and upstream merge source. Kun remains the single runtime/kernel unless a written audit proves it cannot evolve into the OpenCodex kernel.

Required deliverables:
1. docs/REFERENCE_INTAKE.md
2. docs/ENGINE_AUDIT_KUN.md
3. docs/DESKTOP_UX_BENCHMARK.md
4. docs/BROWSER_COMPUTER_CONTROL_PLAN.md
5. README.md, LANDING.md, and NOTICE.md attribution updates

Rules:
- This is a docs-only phase. Do not implement app features.
- Do not add a second runtime beside Kun.
- Do not remove Electron.
- Do not remove English, Arabic, or Chinese language support.
- Do not remove the upstream DeepSeek GUI sync path.
- Use generic language such as User Agent Stack, not personal naming.
- Do not include secrets, tokens, private paths, or private config values.
- Treat every external project as a reference, benchmark, or upstream attribution target only. Do not imply affiliation, endorsement, sponsorship, or code ownership.

Verification:
- git status before edits
- npm test -- src/main/product-brand.test.ts
- npm run typecheck
- Explain why a full build is not required for docs-only changes.
```

## Accepted Product Direction

OpenCodex Desktop is an independent desktop-first agent workbench. It should not remain a DeepSeek-only chat GUI, and it should not present itself as an OpenAI product. The target product class is a local workbench for real project work: workspace-bound threads, file and diff review, terminal awareness, browser/app verification, Skills, MCP, model/provider routing, memory, subagents, permissions, approvals, and cost/cache telemetry.

The public tagline remains:

> An independent open agent workbench. Not affiliated with OpenAI.

English, Arabic, and Chinese remain first-class language surfaces. Arabic RTL support must continue, and Chinese support inherited from DeepSeek GUI/Kun must not be removed during the rebrand or Phase 1 work.

## Engine Decision

Kun remains the single runtime/kernel for now.

Current evidence supports this decision:

- the Electron renderer talks through a preload/main HTTP/SSE bridge rather than embedding the agent loop;
- Electron main owns Kun process startup, localhost base URL resolution, auth headers, and SSE forwarding;
- Kun owns typed contracts, the serve composition root, session/thread stores, approvals, user input gates, usage recording, MCP, Skills, memory, attachments, web tools, and subagent delegation;
- runtime events are persisted and replayable;
- token/cache economy work is already centered in Kun instead of the renderer.

A replacement engine may be considered only after a written audit proves Kun cannot meet the OpenCodex kernel target without unsafe, brittle, or uneconomical rewrites. Until then, new work should extend Kun contracts, services, ports, adapters, settings, and Electron surfaces.

## Desktop Decision

Electron remains the desktop shell. The product value is the desktop workbench, not a generic browser chat wrapper.

Expected boundary:

```text
Electron renderer
  UI panes, composer, approvals, browser evidence, diff/file/terminal views, settings

Electron main
  app lifecycle, windows, IPC, Kun process host, browser host, native permission prompts

Kun kernel
  agent loop, HTTP/SSE contracts, model calls, tools, MCP, Skills, memory, sessions, usage, approvals, subagents

Native/Node sidecars
  browser automation, app/window capture, OS permissions, sandboxed commands, indexing, computer-control adapters
```

Heavy or privileged work must not run as renderer-only JavaScript. Browser automation and computer control need typed tools, sidecar/native boundaries, explicit permissions, visible controls, and audit logs.

## Reference Priority

1. DeepSeek GUI/Kun is the upstream foundation and merge source.
2. Codex and Claude Code define the target-class quality bar for local agent workflows.
3. OpenHanako and Reasonix are technical references for desktop workbench and coding-agent kernel ideas.
4. Crest, cdesktop, Olenro, OpenCode, Goose, Aider, and similar tools are benchmarks for UX, agent orchestration, provider/config management, and coding workflows.

References are inspiration and benchmark material only. They do not create affiliation, endorsement, sponsorship, or permission to copy product identity.

## Phase Exit Criteria

Phase 0.5 is complete when:

- `docs/REFERENCE_INTAKE.md` names the upstream foundation, target-class references, technical references, benchmark projects, and non-affiliation rule.
- `docs/ENGINE_AUDIT_KUN.md` explains why Kun remains the kernel, what it already does well, what gaps remain, and what must be proven before replacing it.
- `docs/DESKTOP_UX_BENCHMARK.md` defines the desktop workbench target across workspace switching, providers, panels, task state, subagents, cost/cache telemetry, and MCP/Skills visibility.
- `docs/BROWSER_COMPUTER_CONTROL_PLAN.md` documents feasible browser/computer-control architecture, sidecar/native boundaries, permissions, audit logs, and the prohibition on unrestricted control in this phase.
- `README.md`, `LANDING.md`, and `NOTICE.md` clearly state independence, DeepSeek GUI/Kun attribution, mark ownership, and non-endorsement.
- Verification commands pass or any failures are reported with concrete evidence.
