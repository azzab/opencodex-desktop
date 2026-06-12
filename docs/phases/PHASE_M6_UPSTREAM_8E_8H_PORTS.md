# Phase M6: Upstream Wave-8 Remainder Ports (8E, 8G, 8H; 8F judgment)

## Window And Model
- pi · `deepseek-v4-pro` · `--thinking high` · session `oc-m6-upstream` · worktree `../ocx-m6`

## Goal
Port the remaining upstream `develop` lanes deferred by the Wave 7 audit, in
order: **8E** (Write workspace per-keystroke performance — careful, local
fork edits exist), **8G** (SDD requirement traceability loop), **8H** (image
generation, OpenAI-compatible — must pass a policy review: provider keys via
M2 credential service, disabled-by-default, audited). **8F** (Tiptap rich
Write mode) gets a port-feasibility judgment only: if the dependency/migration
risk is still high, document the skip — do not half-port it.

## Read First
1. `docs/phases/_OC_HARNESS_FOUNDATION.md`
2. `docs/WAVE_7_UPSTREAM_DEVELOP_DRIFT_AUDIT.md` (lane classification + risks)
3. `docs/phases/PHASE_H11_UPSTREAM_WAVE8_PORTS.md` discipline (gate per lane, skips documented)
4. Fresh `git fetch upstream` — re-audit develop drift since the last review and add any NEW safe commits to the port list (or document skips)

## Scope
- Per-lane discipline identical to H11: one commit series per lane
  (`port(8E): ...`), full gate green after EACH lane, OpenCodex guardrails
  preserved over upstream defaults, every skipped hunk documented.
- 8E: reconcile with local Write/inline-completion fork edits — local
  behavior wins where they conflict; record before/after keystroke timings.
- 8G: SDD traceability — integrate with the existing SDD draft store.
- 8H: imagegen routed through M2 encrypted credentials; new surface is
  disabled-by-default with audit events; i18n en+zh+ar.
- 8F: written feasibility verdict (port now / defer with reasons) in the report; port only on a "now" verdict with the orchestrator's confirmation.

## Out Of Scope
- Upstream branding/identity; any lane beyond 8E–8H + newly audited safe commits.

## Verification
Full Definition-of-Done gate after each lane, plus 8E perf timings and 8H disabled-by-default proof.

## Stop Gates
- Gate green per lane, not just at the end.
- 8E before/after performance numbers recorded.
- 8H: fresh config → imagegen tool denied + audited; keys only via M2 storage.
- Updated drift audit appendix: upstream commits reviewed since Wave 7, each ported or skip-documented.

## Git Commit Message
Series: `port(8E): …`, `port(8G): …`, `port(8H): …`, plus `docs: 8F feasibility verdict and updated drift audit`.

## Short Launcher Prompt
Read docs/phases/_OC_HARNESS_FOUNDATION.md, docs/phases/PHASE_M6_UPSTREAM_8E_8H_PORTS.md, and docs/WAVE_7_UPSTREAM_DEVELOP_DRIFT_AUDIT.md. Fetch upstream and re-audit develop drift, then port lanes in order 8E → 8G → 8H with the full gate green after each: 8E reconciled with local Write fork edits (local behavior wins; record keystroke timings), 8G integrated with the SDD draft store, 8H image generation behind M2 encrypted credentials and disabled-by-default with audit. For 8F deliver a written port/defer verdict only — no half-port. Preserve OpenCodex guardrails over upstream defaults; document every skip. Nonzero exits are failures. End with READY_FOR_ORCHESTRATOR_REVIEW listing per-lane commits, perf numbers, 8F verdict, skip list, tests + results, and gaps.
