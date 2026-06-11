# Wave 7 Upstream Develop Drift Audit

Date: 2026-06-10

## Scope

Wave 7 answers whether any work remains after the DeepSeek GUI `v0.2.8`
ingestion and release-candidate waves.

This is an audit of unreleased `upstream/develop` drift. It is not a merge,
cherry-pick, release, tag, upload, notarization, or update-channel promotion.

## Current Upstream State

Fresh upstream command:

```bash
git fetch upstream --tags --prune
```

Fetched refs:

| Ref | Commit | Release interpretation |
| --- | --- | --- |
| `upstream/master` | `f1f8d1b` | Tagged `v0.2.8`; current stable release baseline. |
| `upstream/develop` | `e7e8252` | Unreleased branch drift after `v0.2.8`; future integration candidate only. |

Branch relationship:

```bash
git rev-list --left-right --count upstream/master...upstream/develop
```

Result:

```text
12 17
```

Interpretation: this is not a clean fast-forward. `upstream/develop` has 17
commits outside `v0.2.8`, and `upstream/master` has 12 commits not in
`develop`. The release lane remains `v0.2.8`; `develop` should be handled as a
separate future-lane audit and integration plan.

## Develop Commit List

```text
fd9dd5a fix(git): walk up directory tree to find nearest .git root
30fef2e test(git): add getGitBranches integration tests for subdirectory workspace roots (issue #98)
3d794b3 fix: enforce plan-mode tool isolation and auto-scroll on new user message
a6b5df9 fix: remove bash from plan read-only tools and add test coverage
96ba615 fix: remove duplicate usage stats from chat topbar
39d28db fix: harden plan mode, usage tracking, and desktop confirms
45baa09 feat(kun): enforce per-turn sandbox mode and finalize stuck turn items
8e5da5d perf(kun): fix startup ready timeouts and cut thread store I/O
46e81b9 perf(runtime): batch SSE events per network chunk across IPC
05b9416 perf(write): cut per-keystroke costs in the write workspace
8047b11 feat(write): replace markdown editing with Tiptap rich mode behind a fidelity gate
601d90c feat(sdd): close the requirement-to-development loop with traceable R blocks
c080b56 feat(imagegen): add OpenAI-compatible image generation across chat and write
0f8703c fix: remove duplicate usage stats from chat topbar (#185)
140aab7 fix(git): walk up directory tree to find nearest .git root (#112)
11ef40b fix: enforce plan-mode tool isolation and auto-scroll on new user message (#167)
e7e8252 chore: post-merge cleanup for #167
```

## Delta Size

`git diff --stat upstream/master..upstream/develop` reports:

```text
124 files changed, 9757 insertions(+), 458 deletions(-)
```

The delta touches Kun runtime internals, Electron IPC/preload, renderer
workbench/write/plan/SDD UI, app settings, package dependencies, tests, and
postinstall/build tooling.

## Classification

| Area | Upstream signal | Local interpretation | Future lane |
| --- | --- | --- | --- |
| Git repository discovery | nearest `.git` root discovery and tests | Useful and likely low risk, but not part of tagged `v0.2.8` | Wave 8 low-risk cherry-pick candidate |
| Plan-mode isolation | plan read-only tool restrictions, auto-scroll, confirm hardening | Security-sensitive; must be reconciled with OpenCodex's current permission model | Wave 8 security/runtime candidate |
| Usage display cleanup | duplicate usage stat cleanup | Small UI correctness candidate; verify against local usage/cache telemetry changes first | Wave 8 UI cleanup candidate |
| Kun sandbox per turn | per-turn sandbox policy and stuck-turn finalization | High-value but central to runtime behavior; needs contract review and full Kun verification | Separate runtime hardening wave |
| Kun store and startup performance | hybrid store I/O and startup readiness timeout changes | Performance-sensitive and partly overlaps local timing hardening | Separate runtime performance wave |
| Runtime SSE batching | IPC event batching per network chunk | Could affect renderer stream semantics; needs SSE/IPC regression tests | Separate runtime performance wave |
| Write workspace performance | per-keystroke cost reductions | Useful, but current local Write state already has fork-specific edits | Write performance wave |
| Tiptap rich Write mode | rich editor, markdown projection, paste image, inline completion extensions | Large feature surface with new deps and migration risk | Dedicated Write rich-mode wave |
| SDD traceability | requirement blocks, trace compute, verify prompts, UI badges | Product feature expansion, not release stabilization | Dedicated SDD traceability wave |
| Image generation | OpenAI-compatible image generation provider across chat/write | New external-provider surface; requires OpenAI docs, secret handling, UI placement, and policy review | Dedicated imagegen feature wave |
| Locale changes | upstream en/zh key additions only | OpenCodex must preserve English, Arabic, and Chinese; Arabic coverage decision remains separate | Per-feature locale pass |

## Decision

Do not merge `upstream/develop` into the `0.2.8` release-candidate lane.

Reasons:

- `upstream/master` remains the `v0.2.8` release baseline.
- `develop` is branch drift, not a clean successor to `v0.2.8`.
- The delta is broad and includes new feature surfaces, dependencies, runtime
  behavior, settings, and UI.
- The current local tree already has a release-candidate package and readiness
  command for `0.2.8`.
- Mixing unreleased `develop` work into the release lane would reset the release
  proof burden and require a new integration plan.

## Recommended Next Waves

If pre-release `develop` ingestion is approved later, split it into focused
waves instead of one broad merge:

1. Wave 8A: git discovery and duplicate usage cleanup.
2. Wave 8B: plan-mode isolation and desktop confirm hardening.
3. Wave 8C: Kun per-turn sandbox and stuck-turn finalization.
4. Wave 8D: Kun store/startup and SSE batching performance.
5. Wave 8E: Write performance changes.
6. Wave 8F: Tiptap rich Write mode with migration/fidelity gates.
7. Wave 8G: SDD traceability loop.
8. Wave 8H: image generation provider and UI integration.

Each wave should follow the same guardrails used for `v0.2.8` ingestion:

- keep Kun as the only live runtime;
- keep renderer permissions narrow;
- preserve English, Arabic, and Chinese support;
- do not import DeepSeek GUI branding into public OpenCodex surfaces;
- add focused tests before wiring UI;
- run root and Kun verification gates before calling the wave complete.

## Release Impact

Wave 7 does not add a new `0.2.8` blocker.

The operator checklist for the remaining release proof is
`docs/release/0.2.8-operator-runbook.md`.

The `0.2.8` lane still has only operator-controlled release gates remaining:

- signing/notarization or explicit unsigned local-beta decision;
- manual packaged-app smoke;
- live-provider smoke if provider readiness is claimed;
- Arabic release-scope decision;
- update-channel and rollback notes;
- explicit publish authorization.
