# Phase M5: Windows And Linux Packaging Proof

## Window And Model
- pi · `deepseek-v4-pro` · `--thinking high` · session `oc-m5-packaging` · worktree `../ocx-m5`

## Goal
Prove the packaged app on Windows (NSIS) and Linux (AppImage) the way Wave 5
proved macOS: native-module ABI correctness (node-pty, better-sqlite3),
managed Kun startup, smoke harness, and CI recipes — so v0.4.0 can claim all
three desktop platforms honestly.

## Read First
1. `docs/phases/_OC_HARNESS_FOUNDATION.md`
2. `electron-builder.config.cjs`, `scripts/release-win.ps1`, `scripts/release-common.sh`, `scripts/release-smoke.cjs`
3. H3/H3.5 native-module rebuild scripts (dual-ABI approach)
4. `docs/WAVE_5_RELEASE_CANDIDATE_SMOKE_PACKAGING.md` (the macOS proof pattern to mirror)

## Scope
- Cross-platform audit of main-process code: paths, PTY shell defaults
  (`powershell`/`cmd` vs `bash`), Kun data dir, process reaping, tray/menu.
  Fix what a Windows/Linux run would break; guard platform-specifics.
- electron-builder targets: verify/repair `dist:win` (NSIS x64) and
  `dist:linux` (AppImage x64) configs incl. native deps rebuild per platform.
- CI recipes: GitHub Actions workflow (`.github/workflows/package.yml`)
  building win/linux/mac unsigned artifacts + running the release smoke
  harness per platform (smoke on Linux runner directly; Windows runner
  directly; macOS already proven). Workflow added but publish steps stubbed
  behind the operator env gates.
- Extend `release:readiness` with per-platform artifact checks.

## Out Of Scope
- Code signing (Windows EV cert, etc.) — operator; auto-update channels; ARM Windows/Linux.

## Verification
Full Definition-of-Done gate plus:
```bash
npm run dist:linux   # if host can build it (document if cross-build unsupported on macOS)
# CI proof: workflow run green on win + linux runners (link run in report)
```

## Stop Gates
- CI workflow run green: win NSIS + linux AppImage artifacts produced, release smoke passes on both runners (app boots headless-smoke, Kun starts, PTY spawns with platform shell).
- Platform audit table in the report: every platform-specific code path listed with its guard.
- `release:readiness` reports the new artifacts.

## Git Commit Message
`feat(packaging): windows nsis + linux appimage proof with per-platform smoke and CI recipes`

## Short Launcher Prompt
Read docs/phases/_OC_HARNESS_FOUNDATION.md and docs/phases/PHASE_M5_WIN_LINUX_PACKAGING.md. Audit and fix cross-platform main-process code (paths, PTY shells, Kun data dir, reaping), verify/repair dist:win NSIS and dist:linux AppImage with native-module rebuilds, add a GitHub Actions packaging workflow that builds unsigned win/linux/mac artifacts and runs the release smoke per platform (publish steps stubbed behind operator env gates), and extend release:readiness with per-platform artifact checks. Run the full gate; the win/linux proof is the CI run — link it. Nonzero exits are failures. End with READY_FOR_ORCHESTRATOR_REVIEW listing changed files, the platform audit table, CI run link + results, and gaps.
