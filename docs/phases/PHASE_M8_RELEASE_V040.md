# Phase M8: v0.4.0 Parity, Security Review, And Release Readiness

## Window And Model
- Actor: **orchestrator** (Codex `gpt-5.5`, reasoning `extra high`) + pidev `--max` evidence sessions (`oc-m8-release`) on `main`.

## Goal
Mirror H12 for the M-series: evidence-backed parity matrix update (now
including coding-loop quality from M7's scorecards), security review of the
new surfaces, localization re-verification (including the mobile app),
multi-platform packaging readiness, and `docs/release/0.4.0-operator-runbook.md`.
Version to `0.4.0-rc`. Publishing remains operator-gated.

## Read First
1. `docs/phases/_OC_HARNESS_FOUNDATION.md` + M-series ledger rows
2. `docs/PHASE_H12_PARITY_RELEASE_V030_REPORT.md` (structure to mirror) and `docs/release/0.3.0-operator-runbook.md`
3. All M1–M7 reports/merge commits

## Scope
### Security review (new M-surfaces)
- M2: credential storage (safeStorage misuse, key echo paths, OAuth callback hijack window).
- M4a/M4b: LAN listener (default-off, scope enforcement bypass attempts, pairing-code brute force, cert pinning, revocation races).
- M3: extension token handling in forks.
- M6 8H: imagegen key usage and disabled-by-default.
- Each finding: fix-now (patched in this phase) vs documented-risk.

### Parity + quality
- Update the parity matrix with M-series rows + M7 benchmark results.
- Localization: locale-coverage green; mobile ar/zh smoke; RTL pass on all new panes.

### Readiness
- `release:readiness` extended with v0.4 gates (LAN-listener security review done, mobile smoke done, multi-platform artifacts present).
- `docs/PHASE_M8_RELEASE_V040_REPORT.md` + `docs/release/0.4.0-operator-runbook.md` (delta from 0.3.0; adds Windows/Linux + mobile sideload + extension publish steps).
- Bump version `0.4.0-rc`. No publish/sign/notarize/upload mutation.

## Verification
Full Definition-of-Done gate plus `npm run smoke:release`, `npm run evals`, `npm run release:readiness`, and platform artifact checks.

## Stop Gates
- Every parity claim evidence-pointed; zero unpatched fix-now findings; all H+M stop-gate tests green on final main; remaining operator gates enumerated.

## Git Commit Message
`docs(release): v0.4.0 parity matrix, M-surface security review, and release readiness evidence` (+ fix commits as needed)
