# User Agent Stack Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a generic User Agent Stack import profile for OpenCodex Desktop settings and Kun config sync.

**Architecture:** Add shared profile types under `agents.kun`, a main-process importer service, IPC/preload methods, and Settings UI controls. Existing `syncGuiManagedKunConfig` consumes persisted profile skill roots and MCP servers; Kun remains the only runtime.

**Tech Stack:** Electron main IPC, React Settings UI, TypeScript, Vitest, Kun config schemas.

---

### Task 1: Shared Profile Types And Normalization

**Files:**
- Modify: `src/shared/app-settings-types.ts`
- Modify: `src/shared/app-settings-kun.ts`
- Modify: `src/shared/app-settings-normalize.ts`
- Test: `src/shared/app-settings.test.ts`

- [ ] Add `UserAgentStackProfileV1` types for skill roots, MCP servers, CLI statuses, redacted preview, and timestamps.
- [ ] Add defaults and merge/normalization helpers.
- [ ] Extend `KunRuntimeSettingsV1` and `KunRuntimeSettingsPatchV1`.
- [ ] Add tests proving defaults, deep merge, and locale preservation.

### Task 2: Importer Service

**Files:**
- Create: `src/main/services/user-agent-stack-service.ts`
- Test: `src/main/services/user-agent-stack-service.test.ts`

- [ ] Discover workspace and user skill roots, including Codex plugin cache skill roots.
- [ ] Read user MCP config shapes and convert `mcpServers`, `servers`, or `capabilities.mcp.servers` to Kun-compatible server objects.
- [ ] Redact secret-like values recursively in imported previews.
- [ ] Check CLI availability with `command --version` or `which` fallback.

### Task 3: Settings Persistence And Kun Config Sync

**Files:**
- Modify: `src/main/kun-process.ts`
- Modify: `src/main/settings-store.test.ts`
- Modify: `src/main/kun-process.test.ts`

- [ ] Include imported skill roots and MCP servers during GUI-managed Kun config sync.
- [ ] Persist imported profile through `JsonSettingsStore`.
- [ ] Prove redacted MCP values are written to Kun config and imported skill roots are included.

### Task 4: IPC And Preload

**Files:**
- Modify: `src/shared/ds-gui-api.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/ipc/register-app-ipc-handlers.ts`
- Modify: `src/main/ipc/register-app-ipc-handlers.test.ts`

- [ ] Expose `previewUserAgentStackImport` and `importUserAgentStack` APIs.
- [ ] Validate payloads with the existing IPC schema pattern.
- [ ] Save imported profile through `applySettingsPatch`.

### Task 5: Settings UI And I18n

**Files:**
- Modify: `src/renderer/src/components/SettingsView.tsx`
- Modify: `src/renderer/src/components/settings-section-agents.tsx`
- Modify: `src/renderer/src/components/settings-section-agents.test.ts`
- Modify: `src/renderer/src/locales/en/settings.json`
- Modify: `src/renderer/src/locales/ar/settings.json`
- Modify: `src/renderer/src/locales/zh/settings.json`

- [ ] Add import, refresh, summary, CLI status, and redacted preview controls.
- [ ] Preserve English, Arabic, and Chinese keys.
- [ ] Keep UI compact and operational, using existing Settings rows and buttons.

### Task 6: Docs And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/KUN_CONFIG.md`

- [ ] Document the profile, redaction boundaries, and Kun config sync.
- [ ] Run targeted tests after each implementation slice.
- [ ] Run `npm test`, `npm run typecheck`, and `npm run build` before final reporting.
