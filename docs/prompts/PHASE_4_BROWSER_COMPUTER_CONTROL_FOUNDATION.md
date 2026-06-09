# Phase 4 Prompt: Browser Automation And Computer Control Foundation

## Recommended Model

- Primary: `gpt-5.5`
- Reasoning: `extra high`
- Why: browser automation and future computer control can expose sessions,
  credentials, screenshots, local files, and OS actions. The first phase must
  prioritize contracts, permissions, audit events, and disabled-by-default
  behavior.
- Implementation helper: `gpt-5.4`, reasoning `high`, for UI-only settings
  polish after contracts are stable.

## Paste-Ready Goal

```text
/goal Phase 4: Browser Automation and Computer Control Foundation

Run from the OpenCodex Desktop repository root.

Objective:
Add a safe, disabled-by-default foundation for browser automation and future
computer control. Keep Electron as the shell and Kun as the kernel. Implement
typed contracts, permission gates, sidecar/native boundaries, audit events, and
settings controls. Do not implement unrestricted computer control.

Model:
Use gpt-5.5 with reasoning extra high.

Read first:
- AGENTS.md and docs/AGENTS.md
- docs/BROWSER_COMPUTER_CONTROL_PLAN.md
- docs/ENGINE_AUDIT_KUN.md
- docs/DESKTOP_UX_BENCHMARK.md
- current Kun tool provider, tool host, runtime events, settings, IPC, and
  renderer settings code

Scope allowed:
- Kun automation capability/config
- Permission service
- Automation sidecar port and mock/no-op adapter
- Automation tool provider behind disabled-by-default settings
- Audit events for requested/allowed/blocked/completed/failed actions
- Settings UI and locale strings
- Tests and Phase 4 docs/report

Scope forbidden:
- No unrestricted OS mouse/keyboard control.
- No external Chrome session automation in this phase.
- No secret entry automation.
- No renderer-run Playwright/CDP automation.
- No production-host automation by default.
- No bypass of Kun approval, permissions, or audit events.
- Do not push unless explicitly requested.

Required behavior:
1. Add agents.kun.automation settings with experimental master switch.
2. Restrict browser automation to local/dev hosts by default.
3. Add per-action gates for navigation, click/type, screenshots, local file
   access, and app/computer control.
4. Keep app/computer control denied in this foundation phase.
5. Add sidecar port and no-op/mock adapter so real automation can plug in later.
6. Emit durable audit events for automation decisions.
7. Add Settings controls and diagnostics without exposing raw screenshots or
   secrets.

Verification:
- Permission decision tests.
- Mock sidecar/action logging tests.
- Settings normalization and IPC/config sync tests.
- Settings UI smoke tests.
- npm test
- npm run typecheck
- npm run build
```

## Exit Criteria

- The app has a safe automation contract and settings surface.
- Automation cannot run unrestricted OS/browser actions.
- Future browser/computer-control implementation has a typed, audited seam.

