# Browser And Computer Control Plan

## Feasibility

Browser automation, browser previews, screenshots, DOM inspection, console/network capture, and local app verification are feasible in Electron.

Computer control is also feasible, but it is a privileged capability. It requires native permissions, platform-specific adapters, visible user controls, and durable audit logs. It must not be implemented as unrestricted renderer JavaScript, and it must not be enabled in this docs-only phase.

## Required Boundary

```text
Kun tool contract
  -> Electron main broker
  -> browser host or native/Node sidecar
  -> browser/OS action
  -> structured result + evidence + audit event
  -> renderer-visible control surface
```

Responsibilities:

- Kun defines typed browser/computer-control tools, permission metadata, run IDs, and audit events.
- Electron main owns BrowserWindow/WebContentsView lifecycle, IPC, native permission checks, and emergency-stop routing.
- Sidecars run Playwright/CDP, accessibility inspection, screenshots, OS-level capture, and input adapters.
- Renderer shows browser panes, screenshots, annotations, approvals, active-control banners, audit history, and stop controls.

## In-App Browser Plan

The first browser-control milestone should be an in-app browser for local verification and evidence capture.

Required capabilities:

- open URL;
- navigate, back, forward, reload;
- capture DOM and accessibility tree summaries;
- collect console logs;
- collect network request summaries with secret redaction;
- screenshot viewport and full page;
- click, type, select, and scroll by selector in the controlled browser only;
- annotate page regions;
- verify localhost development servers;
- attach browser evidence to a thread.

Preferred tool path:

```text
Kun browser tool -> Electron main browser host -> Playwright/CDP/WebContents API -> structured result
```

## External Browser Plugin Later

A browser extension/plugin may later connect external Chrome or Chromium tabs to OpenCodex Desktop with user consent.

Use cases:

- inspect a selected current tab;
- capture chosen DOM/context;
- annotate a real browser session;
- run checks without taking over the user's default browser;
- pass evidence back to the Kun thread.

This should come after the in-app browser is stable because external tabs add more privacy and session-boundary risk.

## Appshots

Appshots are one-way context captures from a desktop app or window:

- screenshot;
- app/window title;
- selected text or accessibility tree when available;
- display/window bounds;
- redaction metadata;
- user confirmation;
- run ID and audit event.

Appshots should initially provide context only. They must not imply permission to control the app.

## Computer Control Definition

Computer control means the agent can observe the screen and perform actions such as click, type, scroll, hotkey, or app switching.

Platform requirements:

- macOS: Screen Recording, Accessibility, and possibly AppleScript, CGEvent, or AX APIs.
- Windows: UI Automation, screenshot APIs, keyboard/mouse input APIs, and PowerShell/Win32 helpers.
- Linux: X11 screenshot/input support where available; Wayland requires portals or compositor-specific support.

## Guardrails

Computer control must require:

- opt-in only;
- disabled-by-default settings;
- per-workspace and per-app allowlists;
- clear active-control banner;
- emergency stop button and hotkey;
- approval before typing or clicking outside trusted windows;
- approval before destructive OS, browser, file, account, payment, deployment, or credential actions;
- rate limits and action throttling;
- screenshot redaction options;
- no secret entry without explicit user confirmation;
- run IDs for every observe/action/result sequence;
- audit logs persisted through Kun events;
- user-visible final evidence for completed automations.

## Sidecar And Native Boundary Requirements

Browser automation and computer control should use sidecars/native adapters rather than renderer-only code.

A sidecar must declare:

- supported platform;
- required OS permissions;
- action schema;
- observation schema;
- redaction behavior;
- timeout and cancellation behavior;
- audit event fields;
- failure modes;
- safe shutdown behavior.

The renderer should never receive raw secret values, private screenshots without user consent, or unredacted logs from sidecars.

## Explicit Non-Implementation Rule For Phase 0.5

Phase 0.5 must not implement unrestricted browser automation or computer control.

This phase may define architecture and safety requirements only. Any future implementation must start behind disabled-by-default settings, typed Kun contracts, permission gates, audit logs, user-visible controls, and verification tests.

## Future Verification Targets

Future browser/control implementation should prove:

- browser pane renders a localhost page;
- screenshot output is nonblank and attached to a thread;
- console and network evidence is captured with redaction;
- selector click/type works only inside the controlled browser;
- emergency stop interrupts active automation;
- audit logs record observe/action/result entries;
- app/window capture requires OS permission and user confirmation;
- computer-control actions cannot run outside allowed windows without approval.
