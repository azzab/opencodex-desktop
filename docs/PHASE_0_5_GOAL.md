# Phase 0.5 Goal: Codex-Parity Reference And Engine Plan

## Goal Launcher

```text
/goal Create Phase 0.5 for OpenCodex Desktop as a docs-only foundation before feature implementation.

Objective:
Make OpenCodex Desktop's public direction explicit: Codex is the compass, the desktop app is the selling point, and Kun remains the single runtime unless a written engine audit proves it cannot become the OpenCodex kernel.

Deliverables:
- docs/REFERENCE_INTAKE.md
- docs/ENGINE_AUDIT_KUN.md
- docs/DESKTOP_UX_BENCHMARK.md
- docs/BROWSER_COMPUTER_CONTROL_PLAN.md
- README.md and LANDING.md references to the above docs

Rules:
- No feature coding in this phase.
- No second runtime beside Kun.
- Do not remove Electron.
- Do not copy product identity from any reference project.
- Cite reference projects as inspiration/benchmarks only.
- Preserve the non-affiliation notice for OpenAI, Anthropic, DeepSeek, OpenHanako, Reasonix, Crest, cdesktop, Olenro, and related marks.
- Treat browser/computer control as possible but permission-gated, audited, and late-stage.

Verification:
- npm test -- src/main/product-brand.test.ts
- npm run typecheck
```

## Accepted Direction

OpenCodex Desktop is a desktop-first agent workbench. The target is not a generic chat wrapper or a DeepSeek-only GUI. The product should become a Codex-like desktop environment with multi-agent workspaces, file editing, terminals, browser/app verification, Skills, MCP, model routing, cost controls, and controlled subagents.

## Engine Decision

Kun remains the single runtime for now. The work should evolve Kun into the OpenCodex kernel instead of adding a parallel runtime.

Replacing Kun is allowed only after a written engine audit proves that Kun cannot meet the target without unsafe or uneconomical rewrites.

## Desktop Decision

Electron remains the desktop shell. Heavy work must not run in the renderer.

Expected split:

```text
Electron renderer
  UI only: panes, browser view, diff view, terminal view, approvals

Electron main
  window orchestration, IPC, browser host, OS permission prompts

Kun kernel
  agent loop, tools, MCP, sessions, model calls, usage, memory, approvals

Native or Node sidecars
  browser automation, OS screenshots/input, sandboxed commands, indexing
```

## Reference Priority

1. Codex and Claude Code define the target class.
2. Reasonix and OpenHanako are technical reference projects.
3. Crest, cdesktop, Olenro, OpenCode, Goose, and Aider are market/UX benchmarks.
4. DeepSeek GUI/Kun remains the fork foundation and upstream merge source.

## Phase Exit Criteria

- The repo has a public reference intake document.
- The repo has a written Kun engine audit.
- The repo has a desktop UX benchmark.
- The repo has a browser/computer-control feasibility plan.
- README and LANDING state that OpenCodex Desktop is benchmarked against multiple modern agent systems, not only inspired by DeepSeek GUI.
