# Phase 7 Skills, Plugins, Hooks, Rules, And Memory Report

Date: 2026-06-10

## Source Prompt

- `docs/prompts/PHASE_7_SKILLS_PLUGINS_HOOKS_MEMORY.md`

## Implemented In This Slice

- Added Phase 6 carry-forward guards before using the Git review surface for
  Phase 7 work:
  - push preparation is blocked on the configured base branch even when staged
    changes exist.
  - staged and unstaged diffs for the same path are tracked with distinct
    renderer keys so selecting one patch does not show the other patch.
- Added a typed Phase 7 diagnostics result contract in
  `src/shared/phase7-diagnostics.ts`.
- Added a main-process diagnostics service in
  `src/main/services/phase7-diagnostics-service.ts` that inventories skills,
  plugin manifests, hook lifecycle metadata, rules, memory controls, and
  compatibility sources without executing plugin code.
- Skill diagnostics include id, name, description, source, scope, enabled
  state, legacy state, entry path, validation errors, and frontmatter trigger
  hints when present.
- Plugin diagnostics scan the Codex plugin cache for manifests, validate JSON,
  expose id/name/version/description/root/manifest path, and redact secret-like
  values from manifest previews. Plugin code execution remains disabled.
- Hook diagnostics expose the Phase 7 lifecycle phases:
  pre-tool, post-tool, permission request, user prompt submit, session
  start/stop, subagent start/stop, and compaction. Mutating phases are marked as
  requiring trust review and audit visibility.
- Rules diagnostics expose configured prompt-prefix rules with secret redaction.
- Memory diagnostics expose enabled state, user/workspace/project scopes,
  maximum injected record count, create/disable/delete controls, and redaction
  policy.
- Compatibility diagnostics show Codex, Claude Code, OpenCode, and MCP sources,
  marking non-native support as partial with limitations instead of silently
  treating it as executable.
- Exposed diagnostics through validated main IPC, preload, and shared
  `DsGuiApi.getPhase7Diagnostics()`.
- Added right-sidebar diagnostics rendering for skills, plugins, hooks, and
  compatibility sources.
- Added right-sidebar permissions rendering for memory scopes, memory controls,
  and redacted rules.
- Preserved English, Arabic, and Chinese locale coverage for the new sidebar
  labels.

## Non-Goals And Follow-Ups

- Plugin manifests are inventoried and redacted; arbitrary plugin code is not
  executed.
- Hook lifecycle phases are visible and modeled in the GUI diagnostics surface.
  New executable hook plugins were not added in this slice. Existing service and
  Kun boundaries remain the authority for allow/deny behavior.
- Memory records are still created, disabled, deleted, and injected through the
  existing Kun memory APIs and settings diagnostics surfaces; the Phase 7
  sidebar adds visibility rather than replacing those controls.

## Audit Result

- Audited on 2026-06-10 from the repository root.
- Result: acceptable to commit as the Phase 7 slice, including the Phase 6 Git
  review carry-forward changes needed by the Phase 7 preflight gate.
- The commit intentionally excludes unrelated local artifacts under `.agents/`,
  `docs/superpowers/`, `tmp/`, and the remote/mobile planning docs that belong
  to separate future remote-session work.
- Fresh verification passed for the focused Phase 7 tests, full root suite,
  full Kun suite, root and Kun typechecks, production build, and
  `git diff --check`.

## Verification

- `npm test -- src/main/services/git-service.test.ts src/renderer/src/components/ChangeInspector.test.ts`
  - PASS: 2 files, 22 tests.
- `npm test -- src/main/services/phase7-diagnostics-service.test.ts`
  - PASS: 1 file, 1 test.
- `npm test -- src/main/ipc/app-ipc-schemas.test.ts src/renderer/src/components/workbench/WorkbenchSurfacePanel.test.ts`
  - PASS: 2 files, 34 tests.
- `npm test -- src/main/services/skill-service.test.ts`
  - PASS: 1 file, 2 tests.
- `npm test -- src/renderer/src/components/PluginMarketplaceView.test.ts src/renderer/src/components/plugin-marketplace-runtime.test.ts src/renderer/src/components/settings-section-agents.test.ts src/renderer/src/lib/load-kun-diagnostics.test.ts`
  - PASS: 4 files, 22 tests.
- `npm --prefix kun test -- memory-store.test.ts`
  - PASS: 1 file, 5 tests.
- `npm --prefix kun test -- automation-policy.test.ts automation-tool-provider.test.ts domain.test.ts`
  - PASS: 3 files, 27 tests.
- `npm --prefix kun test -- skill-runtime.test.ts capability-registry.test.ts mcp-config.test.ts mcp-tool-provider.test.ts`
  - PASS: 4 files, 29 tests.
- `npm test -- src/main/ipc/app-ipc-schemas.test.ts src/main/ipc/register-app-ipc-handlers.test.ts src/main/kun-process.test.ts`
  - PASS: 3 files, 61 tests.
- `npm --prefix kun run typecheck`
  - PASS: exit 0.
- `npm run typecheck`
  - PASS: exit 0.
- `npm test`
  - PASS: 125 files, 776 tests.
- `npm --prefix kun test`
  - PASS: 45 files, 447 tests.
- `npm run build`
  - PASS: Kun build and Electron Vite main/preload/renderer build completed.
- `git diff --check`
  - PASS: exit 0.
