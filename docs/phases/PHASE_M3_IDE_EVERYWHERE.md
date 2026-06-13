# Phase M3: IDE Experience Parity — Codex/Cline-Class Extension

## Window And Model
- pi · `deepseek-v4-pro` · `--max` · session `oc-m3-ide` · worktree `../ocx-m3`
- **Evidence-gated:** orchestrator must commit `docs/reference-evidence/ide/` (per REFERENCE_EVIDENCE_PLAYBOOK.md) BEFORE dispatch and list the paths in the launcher prompt.
- Upgraded from the original "publishing prep" scope after operator live-testing found the v0.1.0 extension "less than basic" (2026-06-13).

## Goal
Turn the extension from a thread list into a real IDE agent surface — what
Cline/Kilo Code/Codex users expect: a chat panel with streamed markdown,
project-aware sessions (started ad-hoc on 2026-06-13 — finish it), context
attachment from the editor, diff review, and approvals — all as a thin
client of the desktop's app-server protocol. Plus the original fork
compatibility + publishing prep. Measured against committed screenshots.

## Read First
1. `docs/phases/_OC_HARNESS_FOUNDATION.md` + `REFERENCE_EVIDENCE_PLAYBOOK.md`
2. `docs/reference-evidence/ide/EVIDENCE.md` (parity target — every P1 row)
3. `clients/vscode/` INCLUDING the 2026-06-13 operator-session commits (publisher fix, `"type": "module"`, workspace-awareness in `src/workspace.ts`, project-filtered threads, New-thread-bound-to-project) — build on them, don't regress them
4. `docs/APP_SERVER_PROTOCOL.md`; H4 plan-mode + H5 checkpoint events (render them)

## Scope
### Chat panel (the core gap)
- Webview chat: streamed markdown rendering with code blocks (copy/insert-
  at-cursor actions), tool-call events rendered as collapsible steps,
  plan/execute mode visible with H4 approve-to-execute, error/retry states.
- Approvals inline in the chat flow (not just a side list); REMOTE-labeled
  approvals styled distinctly.

### Project + context awareness
- Finish the workspace binding: threads filtered to the opened folder,
  multi-root support, New thread bound to project path (exists — harden + test).
- Context attach: send active file, current selection, or picked files as
  turn context (paths + content through the protocol); `@`-mention file
  picker in the composer; show what context is attached before send.

### Editor integration
- Changed-file events open a native VS Code diff view (virtual docs);
  approve/revert actions route through desktop approvals.
- Status bar item: connection, active turn, current model (from M2.5 quick-
  switch state). Command palette: new thread, open panel, attach selection,
  approve pending.

### Fork compatibility + publishing (original scope, kept)
- API audit + `engines.vscode` floor so Antigravity/Cursor/VSCodium installs work; the 2026-06-13 Antigravity extension-host hang must be investigated and either fixed or documented with a reproducible issue.
- Marketplace + Open VSX packaging, PUBLISHING.md, real publisher id (`opencodex` — set 2026-06-13), icon, README with screenshots of OUR extension.
- Cross-client session parity test (desktop+IDE+CLI same threads, approvals anywhere).

## UI rules (BLOCKING)
- Thin client: protocol calls only; no agent logic in the extension.
- Every P1 evidence row → implemented surface or documented gap.
- Webview CSP strict; no remote script; token never logged.

## Out Of Scope
- Inline completions/autocomplete; JetBrains; marketplace publish (operator).

## Verification
Full Definition-of-Done gate plus:
```bash
npm --prefix clients/vscode run typecheck && npm --prefix clients/vscode test && npm --prefix clients/vscode run package
```

## Stop Gates
- P1 coverage table complete.
- Live smoke (documented with screenshots): in VS Code on this repo — open panel, attach a file + selection, send a turn, watch streamed markdown + tool steps, approve an action, open a changed-file diff, switch project and see threads re-filter.
- `.vsix` installs in VS Code AND one fork; Antigravity hang root-caused (fixed or reproducible-issue documented).
- Cross-client parity test green.

## Git Commit Message
`feat(ide): chat panel with streaming + context attach + diff review — Cline-class extension experience`

## Short Launcher Prompt
Read docs/phases/_OC_HARNESS_FOUNDATION.md, docs/phases/PHASE_M3_IDE_EVERYWHERE.md, and every file in docs/reference-evidence/ide/. Upgrade clients/vscode to a Cline-class experience building ON the 2026-06-13 workspace-awareness commits: webview chat with streamed markdown/code-block actions and collapsible tool steps, inline approvals with plan/execute visibility, context attach (active file/selection/@-mention picker) shown before send, native diff views for changed files with approve/revert via desktop approvals, status bar + command palette, engines.vscode floor for fork installs, Antigravity hang root-cause, Marketplace+Open VSX packaging with PUBLISHING.md. Thin protocol client only; strict webview CSP. Map EVERY P1 evidence row to a surface or documented gap. Run the full gate + extension typecheck/test/package; nonzero exits are failures. End with READY_FOR_ORCHESTRATOR_REVIEW with the P1 coverage table, live-smoke screenshots, changed files, tests + results, and gaps.
