# Wave 3-4 Upstream Parity And Release Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the post-v0.2.8 DeepSeek GUI parity confidence pass and produce release-prep evidence for OpenCodex Desktop without weakening OpenCodex safety defaults.

**Architecture:** Wave 3 is an audit and focused regression wave: compare the current tree to `upstream/master`, port only safe missing tests/coverage, and keep risky upstream behavior as documented skips. Wave 4 is a release-prep documentation and verification wave: record the final parity matrix, intentional skips, local proof, and remaining operator proof before any beta/release decision.

**Tech Stack:** Electron main, React renderer, Kun HTTP/SSE runtime, TypeScript, Vitest, upstream Git remote `https://github.com/XingYu-Zhong/DeepSeek-GUI.git`.

---

### Task 1: Refresh Guardrails And Upstream State

**Files:**
- Read: `/Users/mohamedazab/saas-foundry/CONSTITUTION.md`
- Read: `/Users/mohamedazab/saas-foundry/ADOPTION_MATRIX.md`
- Read: `/Users/mohamedazab/saas-foundry/platform/20-desktop-electron-agent-apps.md`
- Read: `/Users/mohamedazab/saas-foundry/platform/08-agentic-tools-mcp-cli-and-api.md`
- Read: `/Users/mohamedazab/saas-foundry/agentic-coding/05-agent-surfaces-api-mcp-cli-ui.md`
- Read: `/Users/mohamedazab/saas-foundry/agentic-coding/06-security-permissions-audit.md`
- Read: `/Users/mohamedazab/opencodex-desktop/docs/AGENTS.md`

- [x] **Step 1: Verify the checkout and branch shape**

Run:

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
git branch --show-current
git status --short
```

Expected: normal checkout on `main` with existing Wave 1-2 dirty state; continue in place because the active integration state is uncommitted here.

- [x] **Step 2: Fetch upstream**

Run:

```bash
git fetch upstream --tags --prune
git describe --tags --always upstream/master
git rev-list --left-right --count upstream/master...upstream/develop
```

Expected: `upstream/master` describes as `v0.2.8`; `upstream/develop` has `0` commits ahead of `upstream/master`.

### Task 2: Wave 3 Parity Audit And Regression Coverage

**Files:**
- Modify: `/Users/mohamedazab/opencodex-desktop/src/main/claw-runtime.ts`
- Test: `/Users/mohamedazab/opencodex-desktop/src/main/claw-runtime.test.ts`

- [x] **Step 1: Write the failing read-receipt regression**

Add a test importing `registerFeishuReadReceiptNoop` from `src/main/claw-runtime.ts` and asserting it registers a no-op handler for `im.message.message_read_v1`.

- [x] **Step 2: Run the failing test**

Run:

```bash
npm test -- src/main/claw-runtime.test.ts
```

Expected: fail with `registerFeishuReadReceiptNoop is not a function`.

- [x] **Step 3: Extract and wire the helper**

Export `registerFeishuReadReceiptNoop(bridge: unknown): void` from `src/main/claw-runtime.ts`, and call it in the Feishu bridge setup before `bridge.connect()`.

- [x] **Step 4: Run the focused test again**

Run:

```bash
npm test -- src/main/claw-runtime.test.ts
```

Expected: `src/main/claw-runtime.test.ts` passes.

### Task 3: Wave 4 Parity And Release Ledger

**Files:**
- Create: `/Users/mohamedazab/opencodex-desktop/docs/WAVE_3_4_UPSTREAM_PARITY_RELEASE_PREP.md`

- [x] **Step 1: Record upstream state**

Document:

```text
upstream/master = f1f8d1b, tag v0.2.8
upstream/develop = f00d610, ancestor of upstream/master
upstream/master...upstream/develop = 12 left / 0 right
```

- [x] **Step 2: Record ported surfaces**

Document Wave 1-3 ported surfaces: endpoint formats, request-user-input options, SDD dirty restore, active thread workspace PATCH, Linux Wayland IME switches, scheduled-task detector endpoint formats, composer changed-file review card, Feishu markdown/reaction/read-receipt hardening, and workspace PATCH schema tests.

- [x] **Step 3: Record intentional skips**

Document that these are intentionally not merged unless the user explicitly asks: upstream default sandbox `danger-full-access`, visible execution access picker in the composer footer, DeepSeek branding/source strings, unrestricted computer control, and any second runtime/provider path outside Kun.

- [x] **Step 4: Record release-prep checklist**

Document local verification gates, manual Electron smoke still needed for beta/release proof, packaging/signing proof still needed for release proof, and locale limits for Arabic.

### Task 4: Full Verification And Completion Audit

**Files:**
- Read: current worktree and command output.

- [x] **Step 1: Run focused Wave 3-4 tests**

Run:

```bash
npm test -- src/main/claw-runtime.test.ts src/main/app-command-line.test.ts src/main/claw-scheduled-task-detector.test.ts src/renderer/src/lib/composer-change-summary.test.ts src/renderer/src/components/chat/FloatingComposer.test.ts src/shared/update-thread-request.test.ts src/renderer/src/locales/locale-coverage.test.ts
```

Expected: all listed test files pass.

- [x] **Step 2: Run typechecks**

Run:

```bash
npm run typecheck
npm --prefix kun run typecheck
```

Expected: both commands exit 0.

- [x] **Step 3: Run full tests and build**

Run:

```bash
npm test
npm --prefix kun test
npm run build
git diff --check
```

Expected: all commands exit 0.

- [x] **Step 4: Audit against the objective**

Confirm that Wave 3 has completed parity confidence and safe regression coverage, Wave 4 has completed release-prep documentation, upstream safety skips are documented, and no release/publish action was performed.
