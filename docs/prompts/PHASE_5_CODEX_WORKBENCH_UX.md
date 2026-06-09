# Phase 5 Prompt: Codex-Like Desktop Workbench UX

## Recommended Model

- Primary: `gpt-5.4`
- Reasoning: `high`
- Why: this phase is substantial product UI implementation. It needs strong
  frontend judgment, but most deep kernel/security contracts should already
  exist from earlier phases.
- Architecture review: `gpt-5.5`, reasoning `high`, for workbench data model
  and permission-sensitive UX review.

## Paste-Ready Goal

```text
/goal Phase 5: Codex-Like Desktop Workbench UX

Run from the OpenCodex Desktop repository root.

Objective:
Turn OpenCodex Desktop from a chat-centered app into a usable local workbench.
Expose active project, thread state, goals/plans, files, diffs, terminal,
browser evidence, skills/MCP, provider/model, subagents, usage/cost/cache, and
permissions in a coherent desktop layout. Do not create a marketing landing
page. Build the actual operator workspace as the first screen.

Model:
Use gpt-5.4 with reasoning high. Use gpt-5.5 high for architecture review if
the data model or permission UX becomes unclear.

Read first:
- AGENTS.md and docs/AGENTS.md
- docs/DESKTOP_UX_BENCHMARK.md
- docs/BROWSER_COMPUTER_CONTROL_PLAN.md
- docs/REFERENCE_INTAKE.md
- current renderer components, settings components, agent mapper/contracts,
  locale files, and CSS/styling system

Scope allowed:
- Renderer workbench layout
- Pane model and navigation
- Settings/diagnostics surfaces
- i18n strings in English, Arabic, and Chinese
- Main/preload IPC only when needed for existing runtime data
- Focused renderer tests and screenshots if available

Scope forbidden:
- Do not put business/runtime logic in React state.
- Do not add a second runtime.
- Do not hide risky automation behind decorative UI.
- Do not remove Arabic RTL or Chinese locale support.
- Do not push unless explicitly requested.

Required surfaces:
1. Project/workspace header with trust/status.
2. Thread/goal/plan/todo state.
3. File/search/attachment panel.
4. Diff/review panel placeholder or implementation tied to real git state.
5. Terminal panel placeholder or implementation tied to managed terminal state.
6. Browser/evidence panel tied to Phase 4 capabilities.
7. Skills/MCP/provider/model diagnostics.
8. Subagent/team status.
9. Usage/cost/cache telemetry.
10. Permissions/audit visibility.

Verification:
- Renderer tests for the new layout and key states.
- i18n key coverage for English, Arabic, and Chinese.
- Playwright or in-app browser screenshot checks if a dev server is started.
- npm test
- npm run typecheck
- npm run build
```

## Exit Criteria

- The first screen feels like a desktop workbench for real project work.
- Important runtime capabilities are visible without becoming a runtime
  switcher.
- Text/layout works for English, Arabic RTL, and Chinese.

