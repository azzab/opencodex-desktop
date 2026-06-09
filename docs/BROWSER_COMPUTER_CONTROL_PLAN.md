# Browser And Computer Control Plan

## Feasibility

Browser automation, in-app browser workflows, screenshots, and app verification are feasible in Electron.

Computer control is also feasible, but it requires native permissions and platform-specific sidecars. It must not be implemented as unguarded renderer JavaScript.

## Architecture

```text
Electron renderer
  shows browser panes, annotations, screenshots, approvals, and audit history

Electron main
  owns BrowserWindow/WebContentsView, IPC, OS prompts, and native permission checks

Kun
  exposes browser/computer-control tools to the agent through typed contracts

Sidecars
  run Playwright/CDP, OS screenshots, accessibility inspection, and input control
```

## In-App Browser

Electron can host an in-app browser using Chromium surfaces such as `BrowserWindow`, `BrowserView`/`WebContentsView`, or a controlled webview-like pane.

Required features:

- open URL;
- navigate/back/forward/reload;
- inspect DOM and accessibility tree;
- collect console and network logs;
- screenshot viewport/full page;
- click/type/select by selector;
- annotate page regions;
- verify local dev servers;
- attach browser evidence to a thread.

Preferred tool path:

```text
Kun tool -> Electron main browser host -> Playwright/CDP/browser API -> structured result
```

## Browser Plugin

Later, a browser extension/plugin can connect external Chrome/Chromium tabs to OpenCodex Desktop.

Use cases:

- inspect a user's current tab with consent;
- collect selected DOM/context;
- annotate a web app from the real browser;
- run tests without taking over the user's browser session;
- share context with the in-app browser.

This should be a later phase after the in-app browser is stable.

## Appshots

Appshots are context captures from an app/window:

- screenshot;
- window title/app name;
- selected text or accessibility tree when available;
- display/window bounds;
- redaction metadata;
- user confirmation.

Appshots should be one-way context first. They should not imply control.

## Computer Control

Computer control means the agent can see, click, type, scroll, and use desktop apps.

Platform requirements:

- macOS: Screen Recording, Accessibility, and possibly AppleScript/CGEvent/AX APIs.
- Windows: UI Automation, screenshot APIs, keyboard/mouse input APIs, and PowerShell/Win32 helpers.
- Linux: X11 support via tools such as screenshot/input helpers; Wayland needs portals/compositor-specific support.

Required guardrails:

- opt-in only;
- per-app allowlist;
- visible active-control banner;
- emergency stop hotkey;
- approval before typing/clicking outside trusted windows;
- rate limits;
- screenshot redaction options;
- audit log for every observe/action pair;
- no secret entry without explicit user confirmation;
- no destructive OS actions without explicit approval.

## Locked Or Background Computer Use

Locked/background control is possible only after normal computer control is reliable.

Treat it as Phase 10 or later because it raises:

- OS security issues;
- privacy issues;
- session isolation issues;
- remote access issues;
- audit and emergency-stop requirements.

## Phase Plan

Phase 4:

- add browser/app-control requirements to the engine audit;
- define tool contracts and safety policy.

Phase 6:

- add browser preview pane for local dev servers;
- expose screenshot and console/network capture tools;
- attach browser evidence to threads.

Phase 8:

- add Playwright/CDP automation;
- add page annotation flow;
- add Appshots for macOS first;
- add guarded computer-control prototype behind disabled-by-default settings.

Phase 9:

- add external browser extension/plugin;
- add mobile/LAN observer mode for running sessions.

Phase 10:

- evaluate locked/background computer use.

## Initial Verification Targets

- Browser pane renders local `http://localhost` pages.
- Screenshot tool returns a nonblank image.
- Console/network capture is attached to a thread.
- Selector click/type works in the in-app browser.
- User can stop an active automation immediately.
- Audit log records observe/action/result entries.
