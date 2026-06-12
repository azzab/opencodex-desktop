# Phase M7: Coding Harness Quality — Benchmark And Optimization

## Window And Model
- pi · `deepseek-v4-pro` · `--max` · session `oc-m7-quality` · worktree `../ocx-m7`
- Kernel-sensitive. Runs AFTER M6 (both touch Kun core).

## Goal
The H-series proved feature parity; this phase proves (and improves)
**coding-loop quality** — the thing that makes Codex CLI, Claude Code, and
OpenCode feel good: reliable edits, smart context handling, stable prompt
caching, and graceful long-thread behavior. Build a repeatable eval harness,
measure Kun's baseline, land the highest-value optimizations, and prove
improvement on the same suite.

## Read First
1. `docs/phases/_OC_HARNESS_FOUNDATION.md`
2. `docs/kun-architecture.md`, `docs/kun-cache-optimization.md` (cache-first loop design)
3. `kun/src/adapters/tool/` (tool schemas: file edit, search, exec), Kun system prompt(s), compaction/truncation logic (locate it)
4. How reference harnesses behave (from docs/REFERENCE_INTAKE.md): apply-patch-style edits, ripgrep search, AGENTS.md ingestion, todo persistence, subagent prompts

## Scope
### Step 0 — Reference harness study (`docs/HARNESS_REFERENCE_STUDY.md`)
Before building anything, study how the best open-source harnesses solve the
coding loop, and write a findings doc with a pattern → Kun mapping table
(pattern, how reference X does it, file pointer, applies-to-Kun verdict):
- `openai/codex` (Codex CLI): `apply_patch` edit format, AGENTS.md ingestion,
  sandbox + approval model, turn loop structure.
- `Aider-AI/aider`: edit-format research (diff vs whole vs udiff success
  rates), repo-map for context, reflection on failed edits, and its
  `benchmark/` harness design (the model for our evals).
- `sst/opencode`: tool schemas, LSP usage, session/compaction handling.
- `block/goose` and `cline/cline` / `Kilo-Org/kilocode`: tool prompts,
  context window management, checkpoint/diff UX.
- `google-gemini/gemini-cli`: ripgrep tools, memory/context files, loop
  detection.
License discipline: study and **re-implement** patterns; do not copy code or
prompt text verbatim. If anything is adapted beyond ideas, record the source
and license in `NOTICE.md` (all listed repos are Apache-2.0/MIT, but
attribution still applies).

### Eval harness (`kun/evals/`)
- 15–25 scripted coding tasks against fixture repos (fix failing test, add a
  feature with tests, multi-file refactor, find-and-fix bug from a stack
  trace, long-thread continuation after compaction). Seed the suite from
  proven public task designs — Aider's polyglot/Exercism-style exercises and
  SWE-bench-lite-style "issue → failing test → fix" shapes — plus 3–5 tasks
  cut from this repo's own history (real bugs fixed during the H-series make
  ideal fixtures: revert the fix in a fixture copy, ask the agent to find it).
  Run headless via the CLI (`opencodex serve` + protocol), scored
  automatically: task success (tests pass), turns, tokens, cost, cache-hit %,
  wall time, edit-failure count.
- `npm run evals` produces a JSON + markdown scorecard; baseline committed.

### Audit + optimizations (prioritize by measured impact)
- **Edit reliability:** exact-match failure rate; add normalized/contextual
  fallback matching and a structured re-read-then-retry path; never silent
  mis-edits.
- **Search/navigation:** ensure fast ripgrep-backed search + glob tools with
  bounded output; measure tool-call counts per task.
- **Context engineering:** project-context ingestion (AGENTS.md / CLAUDE.md /
  .codex conventions) into the system context; verify prompt-prefix stability
  for cache hits (telemetry exists — assert ≥ target on eval suite); sane
  tool-output truncation with "read more" affordances.
- **Long threads:** compaction behavior — verify continuation correctness
  post-compaction in the eval suite; checkpoint metadata survives.
- **Model-fit prompting:** per-endpoint-format prompt adjustments (DeepSeek vs
  OpenAI-compatible vs Anthropic-shape) where measurably better.

### Report
- `docs/CODING_HARNESS_BENCHMARK.md`: baseline vs post-optimization scorecard,
  what changed and why, known gaps vs reference harnesses (honest).

## Out Of Scope
- New product surfaces; model fine-tuning; swarm changes (Phase 3 owns budgets).

## Verification
Full Definition-of-Done gate plus:
```bash
npm run evals   # scorecard generated; success rate and cache-hit meet targets set in the baseline commit
```

## Stop Gates
- Baseline scorecard committed BEFORE optimizations (two eval runs in history: before/after).
- Post-optimization: task success rate strictly improved or already ≥90%, edit-failure count reduced, cache-hit % not regressed.
- No eval task passes via hardcoded/eval-aware behavior (orchestrator spot-reads the diffs).
- All existing tests still green (kernel changes are regression-prone — full gate is the floor, not the proof).

## Git Commit Message
Series: `feat(evals): kun coding eval harness and baseline scorecard`, then `perf(kun): …` / `fix(kun): …` per optimization.

## Short Launcher Prompt
Read docs/phases/_OC_HARNESS_FOUNDATION.md and docs/phases/PHASE_M7_CODING_HARNESS_QUALITY.md. STEP 0: study the reference harnesses (openai/codex, Aider-AI/aider, sst/opencode, block/goose, cline/cline, Kilo-Org/kilocode, google-gemini/gemini-cli) and write docs/HARNESS_REFERENCE_STUDY.md with a pattern→Kun mapping table (edit formats, repo-map/context ingestion, failed-edit reflection, compaction, loop detection); re-implement ideas, never copy code/prompts verbatim, record any adaptation in NOTICE.md. Then build kun/evals: 15–25 scripted coding tasks on fixture repos (seeded from Aider-polyglot/SWE-bench-lite-style shapes plus 3–5 real bugs from this repo's own H-series history) run headless via the CLI/protocol with automatic scoring (success, turns, tokens, cost, cache-hit %, edit failures) and npm run evals scorecards. Commit the baseline FIRST. Then audit and optimize the coding loop by measured impact: edit-tool reliability with retry-not-silent-failure, ripgrep search with bounded output, AGENTS.md/CLAUDE.md project-context ingestion, prompt-prefix cache stability, tool-output truncation, post-compaction continuation correctness, and per-endpoint-format prompt fit. Rerun evals and write docs/CODING_HARNESS_BENCHMARK.md with honest before/after and gaps. No eval-aware shortcuts. Run the full gate; nonzero exits are failures. End with READY_FOR_ORCHESTRATOR_REVIEW listing changed files, before/after scorecards, tests + results, and gaps.
