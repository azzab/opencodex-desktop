# Phase H12: Parity Re-Audit, Security Review, And v0.3.0 Release Readiness

## Window And Model
- Actor: **orchestrator** (Codex `gpt-5.5`, reasoning `extra high`) driving pidev `--max` audit sessions (`oc-h12-parity`) on `main`. Final judgment calls belong to the orchestrator; evidence gathering can be delegated.

## Goal
Prove the H-series delivered a Codex/Antigravity-class harness: an
evidence-backed parity matrix update, a security review of every new
execution surface, localization re-verification, packaging, and a v0.3.0
readiness report mirroring the Wave 5–6 structure. Publishing remains gated
on the manual operator runbook — this phase produces the evidence, not the
release.

## Read First
1. `docs/phases/_OC_HARNESS_FOUNDATION.md` + completed `OC_BUILD_LOG.md`
2. `docs/PHASE_10_PARITY_HARDENING_RELEASE_REPORT.md` (matrix to update)
3. `docs/WAVE_5_RELEASE_CANDIDATE_SMOKE_PACKAGING.md`, `docs/WAVE_6_RELEASE_AUTHORIZATION_READINESS.md`, `docs/release/0.2.8-operator-runbook.md`
4. All H1–H11 phase reports / merge commits

## Scope
### Parity matrix update
- Re-score every row of the Phase 10 parity matrix against Codex, Claude Code,
  and Antigravity-class capabilities, each claim backed by a test name, file
  path, or smoke transcript. Honest gaps stay listed (computer control,
  cloud workers, mobile relay, marketplace publishing).

### Security review (new surfaces only)
- Terminal panel (H3): PTY scoping, orphan reaping, audit coverage.
- Plan-mode isolation (H4): bypass attempts via app-server protocol, MCP tools, subagents.
- Checkpoints (H5): restore safety with dirty user state.
- Browser sidecar (H6): host allowlist bypass, evidence redaction, sidecar port exposure.
- Hooks (H7): trust revocation races, env leakage, deny-hook abuse.
- Goal/loop (H8): automation bypassing approvals, budget exhaustion.
- Clients (H9): auth token handling, loopback enforcement.
- SSH runner (H10): credential storage, egress policy, host spoofing.
- Each finding: severity, fix-now vs documented-risk; fix-now items get patched in this phase.

### Localization re-verification
- Locale-coverage test green with ar parity enforced; manual RTL pass over every NEW pane (usage, terminal, plan view, checkpoint timeline, evidence, hooks, loops, remote runners).

### Packaging + readiness
- `npm run smoke:release`; unsigned dist dry-runs for mac/win/linux targets available on this machine; `npm run release:readiness` extended with v0.3.0 gates (new-surface security review = done, ar parity = done).
- Produce `docs/PHASE_H12_PARITY_RELEASE_V030_REPORT.md` + `docs/release/0.3.0-operator-runbook.md` (delta from 0.2.8 runbook).
- Bump version to `0.3.0-rc` (package.json) — publish authorization stays manual (`OPENCODEX_RELEASE_PUBLISH_AUTHORIZED`).

## Out Of Scope
- Actual signing/notarization/publishing (operator).
- New features; anything found broken gets fixed or explicitly blocked-listed.

## Verification
```bash
npm run typecheck && npm run lint && npm test
npm --prefix kun run typecheck && npm --prefix kun run test
npm run build && npm run smoke:release
npm run release:readiness
git diff --check
```

## Stop Gates
- Every parity-matrix claim has a verifiable evidence pointer.
- Zero unpatched fix-now security findings.
- All H-series stop-gate tests still green on final `main`.
- Readiness report enumerates the remaining manual operator gates explicitly.

## Git Commit Message
`docs(release): v0.3.0 parity matrix, new-surface security review, and release readiness evidence` (+ fix commits as needed)
