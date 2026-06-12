# Phase M3: IDE Everywhere — Antigravity/Fork Compatibility, Publishing Prep, Shared Sessions

## Window And Model
- pi · `deepseek-v4-pro` · `--thinking high` · session `oc-m3-ide` · worktree `../ocx-m3`

## Goal
Make the H9 VS Code extension a first-class citizen in VS Code AND its forks
(Gemini Antigravity, Cursor, Windsurf, VSCodium), prove shared session
history across desktop/CLI/IDE (one Kun = one account = one thread store),
and prepare publishing artifacts for both the VS Code Marketplace and Open
VSX (the registry forks use). No marketplace publish in this phase — prep and
packaging only.

## Read First
1. `docs/phases/_OC_HARNESS_FOUNDATION.md`
2. `clients/vscode/` (H9 extension), `docs/APP_SERVER_PROTOCOL.md`
3. H9 ledger entries (smoke methodology)
4. Open VSX publishing requirements (namespace, license metadata) and `engines.vscode` compatibility ranges

## Scope
### Fork compatibility
- Audit the extension for proposed/recent APIs; pin `engines.vscode` to the
  lowest version satisfying the feature set so current forks (which lag VS
  Code by months) can install it. Replace any API above that floor.
- Connection robustness: auto-detect the running desktop app-server (existing
  loopback discovery), graceful retry/backoff, clear "desktop not running"
  state with a launch hint.

### Shared sessions ("same account, connected history")
- Verify and harden: a thread created in desktop appears in IDE and CLI with
  live event parity; turns sent from IDE stream in desktop; approvals raised
  anywhere can be answered anywhere (first answer wins, others see resolution).
- Session continuity test: IDE reconnect after desktop restart resumes the
  same thread list and replays missed events (Kun SSE replay already exists).

### Publishing prep
- `clients/vscode/`: complete `package.json` metadata (publisher, icon,
  categories, license, repo), README with screenshots placeholders, changelog.
- Build scripts producing both a Marketplace-ready and Open VSX-ready `.vsix`;
  document the publish commands (vsce / ovsx) in `clients/vscode/PUBLISHING.md`
  — actual publish is operator-gated.
- CLI: `npm pack` artifact + `docs/CLI.md` install section finalized.

## Surfaces to Build (REQUIRED)
- Extension compatibility fixes + connection-state UI + tests.
- Cross-client session parity integration test (desktop-mode app-server mocked or live headless Kun).
- PUBLISHING.md + packaging scripts for vsce/ovsx.

## UI rules (BLOCKING)
- Thin client rule: protocol calls only; no business logic in the extension.
- Auth token handling unchanged (loopback, never logged).

## Out Of Scope
- Marketplace/Open VSX publish (operator); inline completions; JetBrains.

## Verification
Full Definition-of-Done gate plus extension package tests:
```bash
cd clients/vscode && npm test && npx vsce package && npx ovsx verify-pat --help >/dev/null 2>&1 || true
```

## Stop Gates
- `.vsix` installs and connects in at least one real fork (manual smoke documented — Antigravity preferred, VSCodium acceptable as the open-source proxy).
- Cross-client parity test green: same thread visible/streaming in desktop + IDE + CLI; approval answered from IDE resolves everywhere.
- `engines.vscode` floor documented with the API audit table.

## Git Commit Message
`feat(ide): fork-compatible extension, cross-client session parity proof, and marketplace/openvsx publishing prep`

## Short Launcher Prompt
Read docs/phases/_OC_HARNESS_FOUNDATION.md and docs/phases/PHASE_M3_IDE_EVERYWHERE.md. Make the clients/vscode extension installable on VS Code forks: audit and floor engines.vscode (replace any API above the floor), add robust connection states with retry/backoff, prove cross-client shared sessions (desktop+IDE+CLI same threads, live event parity, approvals answerable anywhere with first-answer-wins), and produce Marketplace + Open VSX packaging with PUBLISHING.md (no actual publish). Thin protocol client only. Run the full gate plus extension tests and vsce package; nonzero exits are failures. End with READY_FOR_ORCHESTRATOR_REVIEW listing changed files, the API audit table, parity test evidence, tests + results, and gaps.
