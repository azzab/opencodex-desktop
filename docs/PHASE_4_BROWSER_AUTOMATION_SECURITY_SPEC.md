# Phase 4 Browser Automation And Computer Control Foundation Spec

Date: 2026-06-09

## Goal

Add a safe, disabled-by-default foundation for browser automation and future
computer control while keeping Electron as the shell and Kun as the kernel.

## Source-Of-Truth Reads

- `docs/AGENTS.md`: Kun remains the only runtime; settings live under
  `agents.kun`; renderer must not own agent/runtime logic.
- `docs/BROWSER_COMPUTER_CONTROL_PLAN.md`: browser and computer control require
  typed Kun contracts, sidecar/native boundaries, permission gates, audit logs,
  and visible user controls.
- `docs/ENGINE_AUDIT_KUN.md`: browser/control work belongs in Kun contracts,
  services, ports, adapters, HTTP/SSE mapping, and thin Electron UI.
- SaaS Foundry desktop-agent, agent-surface, security/audit, privacy, UI, and
  verification guidance.

## Risk Classification

Risky. Browser sessions, screenshots, local files, and app control can expose
secrets or mutate the user's machine. Phase 4 therefore adds contracts, gates,
settings, audit events, and a sidecar port only. It does not implement
unrestricted computer control.

## Architecture

```text
Kun automation tool contract
  -> Kun automation permission service
  -> Kun automation audit event
  -> Automation sidecar port
  -> Electron/native browser host or OS adapter later
  -> structured result
  -> renderer diagnostics/settings surface
```

Electron renderer may show the existing workbench browser preview and settings.
It must not run Playwright, CDP, OS input, file access, or app control. Future
real browser automation plugs into the sidecar port from Electron main or a
native-safe Node process.

## Settings Contract

`agents.kun.automation` stores:

- `enabled`: experimental master switch, default `false`;
- `browserWorkbenchEnabled`: shows the manual browser panel, default `true`;
- `localDevOnly`: restricts browser targets to local/dev hosts, default `true`;
- `allowedHosts`: default `localhost`, `127.0.0.1`, and `::1`;
- permission gates for browser navigation, click/type, screenshots, local file
  access, and app control using `deny`, `ask`, or `allow`;
- audit settings for action logs. If audit logging is disabled, Kun does not
  register automation tools.

Enabling automation does not grant file or app control. App/computer control
remains denied unless a later phase adds explicit native permissions, visible
control banners, emergency stop, and per-app allowlists.

## Minimal Vertical Slice

- Add Kun `capabilities.automation` config and runtime manifest diagnostics.
- Add shared settings defaults, normalization, IPC schema support, and config
  sync.
- Add a Kun automation permission service.
- Add an automation sidecar port and mock/no-op adapter.
- Add an automation tool provider that only executes through the sidecar port.
- Add runtime audit events for requested, allowed, blocked, completed, and
  failed automation actions.
- Add Settings > Agents controls for experimental automation and permission
  gates.

## Non-Goals

- No unrestricted OS mouse/keyboard control.
- No external Chrome session automation.
- No secret entry automation.
- No renderer-run Playwright/CDP automation.
- No production-host automation by default.
- No bypass of Kun approval, permissions, or audit events.

## Verification

- Unit tests for permission decisions.
- Mock sidecar test proving action logging.
- Settings normalization and IPC/config sync tests.
- Settings UI smoke test.
- Full `npm test`, `npm run typecheck`, and `npm run build`.
