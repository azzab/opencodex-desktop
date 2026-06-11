# Phase H6: Real Browser Automation Sidecar With Evidence Capture

## Window And Model
- pi · `deepseek-v4-pro` · `--max` · session `oc-h6-browser` · worktree `../ocx-h6`
- Security-sensitive: first real automation execution path.

## Goal
Replace the Phase 4 mock/no-op automation adapter with a real Playwright
sidecar, strictly behind the existing permission gates: navigation,
click/type, and screenshots on allowed hosts, plus DOM/console/network
evidence capture surfaced in the workbench. Automation stays
**disabled-by-default**; computer/app control stays **always-deny**. This is
the Antigravity-style "agent can verify its work in a browser" capability.

## Read First
1. `docs/phases/_OC_HARNESS_FOUNDATION.md`
2. `docs/PHASE_4_BROWSER_AUTOMATION_SECURITY_SPEC.md` + `docs/PHASE_4_VERIFICATION_REPORT.md` (contracts, gates, sidecar boundary, audit policy — all already exist)
3. `docs/BROWSER_COMPUTER_CONTROL_PLAN.md`
4. The mock adapter implementation under Kun automation adapters

## Scope
### Sidecar
- Playwright-driven sidecar process (Chromium), launched on demand on the
  reserved sidecar port (loopback only), terminated with the app/thread.
- Implements the existing Kun automation contracts: navigate, click, type,
  wait, screenshot, read DOM snapshot. Each action checks the Phase 4
  permission service per-gate and emits the existing audit events.
- Host allowlist enforced in the sidecar too (defense in depth): default
  localhost/dev hosts per Phase 4 settings; navigation to a non-allowed host
  is blocked + audited.

### Evidence
- Per automation session: screenshots, console log entries, network request
  summaries (method, URL, status — bodies only for allowed hosts and with
  secret-pattern redaction), stored under the thread artifacts.
- Renderer evidence surface: per-thread automation evidence list with
  screenshot preview, console, and network tabs.

### Settings
- Keep `agents.kun.automation` experimental toggle as the master switch;
  default OFF. App/computer control remains denied regardless of settings.

## Surfaces to Build (REQUIRED)
- Sidecar adapter (replacing mock as the real implementation; keep mock for tests) + lifecycle management + tests.
- Evidence storage + contracts + IPC.
- `src/renderer/src/components/automation/EvidencePanel.tsx` (loading/empty/error/success).

## UI rules (BLOCKING)
- i18n en+zh+ar; RTL-safe.
- Playwright must be an optional/lazy dependency path — packaging (`npm run dist` dry-run) must still succeed and the app must run when browsers are not installed (clear error state, no crash).
- Redact secret patterns from all captured evidence (reuse Phase 1 redaction).

## Out Of Scope
- OS-level computer control, external Chrome profiles, CDP attach to user browsers.
- Autonomous unattended browsing of arbitrary internet hosts.
- Mobile/remote evidence relay.

## Verification
```bash
npm run typecheck && npm run lint && npm test
npm --prefix kun run typecheck && npm --prefix kun run test
npm run build
git diff --check
npx playwright install chromium   # in CI/dev only, for the smoke below
```

## Stop Gates
- Integration smoke (can be a vitest tagged test): with automation enabled and a local test page served, the agent toolchain navigates, clicks, types, screenshots; evidence artifacts exist on disk; audit events recorded per action.
- Disabled-by-default proof: fresh config → any automation tool call is denied + audited.
- Non-allowed host navigation blocked.
- Packaging dry-run succeeds without bundling browsers.

## Git Commit Message
`feat(automation): real Playwright sidecar behind Phase 4 gates with screenshot/console/network evidence`

## Short Launcher Prompt
Read docs/phases/_OC_HARNESS_FOUNDATION.md and docs/phases/PHASE_H6_BROWSER_AUTOMATION_SIDECAR.md. Implement a Playwright Chromium sidecar fulfilling the existing Phase 4 Kun automation contracts (navigate/click/type/wait/screenshot/DOM snapshot), loopback-only, per-action permission checks + audit events, host allowlist enforced in the sidecar, evidence capture (screenshots, console, redacted network summaries) stored as thread artifacts with a renderer EvidencePanel. Automation stays disabled-by-default; computer/app control stays always-deny; packaging must work without bundled browsers. Run the full verification block; nonzero exits are failures. End with READY_FOR_ORCHESTRATOR_REVIEW listing changed files, smoke evidence paths, tests + results, and gaps.
