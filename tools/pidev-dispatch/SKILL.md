---
name: pidev-dispatch
description: >-
  Delegate coding tasks to the pi.dev coding agent (`pi`, the locally-installed
  pidev worker) from inside ANY project, then poll it, read its real transcript,
  and send follow-up orders that resume the same session with full context. Use
  when the user says things like "dispatch pidev", "delegate this to pi/pidev",
  "have pidev build/fix X", "ask/tell pidev to ...", "send pidev an order",
  "check on pidev", or "what did pidev do". Claude Code stays the orchestrator;
  pidev does the autonomous building.
---

# pidev-dispatch

Run the locally-installed **pi.dev** coding agent (`pi`) as a delegated worker.
You (Claude Code) are the orchestrator: you frame the task, dispatch it, watch
the run, verify the result, and relay follow-up orders. pidev does the heavy
autonomous editing/building inside the target project.

All operations go through one script. Set it once per task:

```bash
PIDEV="$(git rev-parse --show-toplevel)/tools/pidev-dispatch/scripts/pidev.sh"   # vendored — repo policy; do NOT use the ~/.claude copy here
```

## When to reach for this

Dispatch to pidev when the user explicitly asks, or when a task is a good fit
for a cheap autonomous worker (well-scoped feature, refactor, bug fix, test
writing) and the user wants it handed off rather than done inline. For quick
edits you can do yourself, just do them — don't round-trip.

## The model: one session-id == one ongoing conversation

`pi -p --session-id <id>` **creates** the session on first use and **resumes it
with full prior context** on every later use, appending to a single transcript.
So pick a short, descriptive, filesystem-safe id (`[a-z0-9-]`, e.g.
`cc-auth-fix`, `cc-landing`) and reuse it for the whole task. Different task →
different id.

## Workflow

### 1. Dispatch (start the task)

Run from the project you want pidev to work in (or pass `--cwd`):

```bash
"$PIDEV" dispatch cc-auth-fix "Add rate limiting to the login endpoint in src/auth. Use the existing redis client. Add tests." 
```

For long phase prompts or correction orders, prefer file input so shell quoting,
backticks, and Next route globs like `[community]` cannot corrupt the prompt.
The prompt path only needs to be readable, so shell process substitution is safe
when you want file-input quoting without creating a repo-side temp file:

```bash
"$PIDEV" order-file ocx-phase-fix /tmp/ocx-correction.txt --cwd "$PWD" --thinking high
"$PIDEV" dispatch-file ocx-feature <(printf '%s\n' "$LONG_PROMPT") --cwd "$PWD" --max
```

- Launches `pi` detached (survives across your turns) and returns immediately
  with the pid, log path, and session file path.
- Launches with the user's **full pi config**: read/bash/edit/write tools, installed
  skills, Proxima MCP, `AGENTS.md` policy.

#### Model routing — the right DeepSeek per task
Default (no `--model`) = **`deepseek-v4-pro`**. Pick reasoning by risk:
- payments / security / migrations → `--max` (xhigh) or `--thinking high`
- normal features → default (medium)
- trivial / mechanical / throwaway → `--cheap` (routes to **`deepseek-v4-flash`**, thinking off)

Stay on DeepSeek — it's ~16× cheaper than `minimax/minimax-m3` on cache reads and won the
head-to-head. Only `--model minimax/minimax-m3` if the user explicitly asks for a second opinion.

- Flags: `--cwd <dir>`, `--thinking off|low|medium|high|xhigh`, `--cheap` (flash),
  `--max` (xhigh), `--approve` (only if a run hangs on project-trust — implies trusting
  that project's local `.pi` code, so confirm intent).

Tell the user it's dispatched and roughly what you asked for.

### 2. Watch it

Poll explicitly:

```bash
"$PIDEV" status cc-auth-fix     # running/finished, msg count, latest assistant text, log tail
"$PIDEV" tail   cc-auth-fix 20  # last 20 turns (assistant text + tool calls)
```

Or block until it finishes — ideal as a backgrounded Bash call so you're
notified on completion instead of polling:

```bash
"$PIDEV" wait cc-auth-fix       # blocks, then prints the final report
```

(Run `wait` with the Bash tool's `run_in_background: true` so the harness
re-invokes you when pidev is done.)

### 3. Read the result

```bash
"$PIDEV" report cc-auth-fix     # full text of pidev's final message
```

**The session JSONL is the source of truth, not stdout** — headless `pi -p` can
print empty stdout even on success; `report`/`tail` read the transcript
directly, so trust those.

### 4. VERIFY — do not trust pidev's self-report

pidev sometimes misreports what it changed (e.g. claims a revert it didn't
actually make). Before you relay success, check the ground truth yourself:

```bash
"$PIDEV" diff cc-auth-fix     # git status + diff --stat + new files, in the session's cwd
"$PIDEV" cost cc-auth-fix     # $ spent, tokens, cache-hit %, duration, turns, model
```

Read key changed files / run the project's tests. Report what you actually
observe, flagging any gap between pidev's claim and reality. Log cost per phase.

### 5. Interfere / steer / fix — act as the user

You can intervene at any point, as if the user were sitting here:
- **Correct course:** `"$PIDEV" order <id> "..."` — resumes with full context.
- **Abort a bad/looping run:** `"$PIDEV" stop <id>` (kills the process, keeps the
  transcript), then `order` it with a fix, or take over and edit files yourself.
- **Fix directly:** you have Edit/Write — for a small fix, just make it yourself
  rather than round-tripping; then `order` pidev to continue from the new state.
- **Escalate reasoning:** re-dispatch with `--max` if a hard step keeps failing.

When the user gives a new instruction for the same task, resume the same session
(it keeps full context of everything pidev already did):

```bash
"$PIDEV" order cc-auth-fix "The tests fail on the burst case — fix the window math and re-run them."
"$PIDEV" wait  cc-auth-fix
```

`order` == `dispatch` mechanically; the distinction is just intent (continuing
vs starting). Repeat dispatch → watch → verify → order as the user steers.

Use `"$PIDEV" list` to recall active session-ids if you lose track. If the user
says "tell pidev ..." without naming a task, default to the most recent
RUNNING/finished session from `list` (confirm if ambiguous).

## Guardrails

- **Autonomy is real.** The dispatched agent edits files and runs shell commands
  in the target project without further confirmation. Prefer dispatching inside
  a git repo (changes are reversible). For destructive or outward-facing tasks,
  confirm with the user before dispatching.
- **Never put secrets in the task text** — it's stored in the transcript and
  orchestrator metadata. Reference env vars / files instead.
- **Proxima dependency:** if the task needs Proxima MCP, the Proxima Electron app
  must be open or those tool calls fail. Surface that rather than silently
  retrying.
- **macOS has no `timeout`** — this skill already uses background+poll; don't
  wrap `pi` in `timeout`.
- **Short/early finish is suspect.** If a run ends with little done, `stop` then
  re-`order` "continue and finish the task" and watch again. (Note: pi's heavy
  `context-mode` package destabilizes headless runs — it is disabled in settings for
  unattended chains. If re-enabled for interactive use, expect more short finishes.)

## Subcommand reference

| Command | Purpose |
|---|---|
| `dispatch <id> "task" [flags]` | Start (or resume) a session with a task |
| `order <id> "order" [flags]` | Send a follow-up order to the same session |
| `dispatch-file <id> <prompt-file> [flags]` | Start a session using prompt text from a file; preferred for long prompts |
| `order-file <id> <prompt-file> [flags]` | Send a follow-up order from a file; avoids shell quoting/glob loss |
| `status <id>` | Running/finished + latest assistant text + log tail |
| `tail <id> [n]` | Last n transcript turns (default 14) |
| `cost <id>` | $ spent, tokens, cache-hit %, duration, turns, model |
| `diff <id>` | git status + diff --stat + new files in the session's cwd (verify) |
| `stop <id>` | Kill a running session (transcript preserved; resume with `order`) |
| `report <id>` | Full final report (last assistant message) |
| `wait <id> [maxsec]` | Block until finished, then print report (default 1800s) |
| `list` | List orchestrated sessions and their state |
| `selftest` | No-cost wrapper/parser smoke test; run between phase commits before the next dispatch |
| `preflight <id> [cwd]` | No-cost fresh-run readiness gate: selftest, stale id, live worker, dirty tree, conflict markers |

Flags for `dispatch`/`order`: `--model <m>`, `--thinking <level>`,
`--cwd <dir>`, `--approve`. Override `PIDEV_BIN` if `pi` isn't at
`/opt/homebrew/bin/pi`.

## v2 run-quality gates (2026-06-11 — after the stale-session/empty-run incident)

The wrapper now **fails fast** instead of letting low-value runs masquerade as results:

Implementation note for this vendored wrapper: headless `pi -p --session-id` and orphaned detached
`nohup` runs can stop after tool results without writing the final assistant text. The wrapper
therefore launches pi in JSON mode with a named session, records the created session file for future
`order` resumes, treats the JSON run log as the orchestrator evidence transcript for
`wait`/`report`/`tail`/`cost`, and runs foreground-by-default (legacy detach is opt-in via
`PIDEV_DETACH=1`).

Run `"$PIDEV" selftest` between committed phases or after wrapper edits. It does not call the pi API:
it feeds synthetic transcripts through the parser and verifies `report`, `count`, `cost`, and
`DIED_MID_RUN` shape detection. A failed selftest means fix the wrapper before spending a real phase run.

For fresh phase starts, prefer `"$PIDEV" preflight <fresh-id> <cwd>` before dispatch. It is also
no-cost: it runs the parser selftest, reports unrelated live pi workers, rejects stale session ids,
and verifies the target git tree has no dirty files or conflict markers. If preflight fails, fix that first;
do not spend a model run hoping the worker will recover from orchestration state.

1. **Fresh means fresh** — `dispatch` with an id that already has a transcript exits **4
   `SESSION_EXISTS_USE_ORDER_OR_NEW_ID`**. A resumed transcript can return a STALE "complete"
   report from an old attempt. Fresh attempt ⇒ fresh id;
   continue ⇒ `order`; deliberate resume-via-dispatch ⇒ `--resume`.
2. **Dirty trees are explicit** — `dispatch` on a dirty/conflicted tree exits **5
   `DIRTY_TREE_USE_ALLOW_DIRTY`** unless `--allow-dirty` is passed. When you pass it, the task
   prompt MUST say: *"You are resolving the CURRENT worktree, not starting from scratch.
   Preserve unrelated changes."* (`order` is exempt — it resumes in-flight work by nature.)
   Preflight always prints dirty-file count, conflict-marker files, and any live pi worker
   (a second live worker aborts the launch).
3. **Run failures are classified** — `wait` exits **3** for two different wrapper signals.
   `DIED_MID_RUN` means the worker ran tools, then died before its final assistant report
   (usually a transient API/headless blip). Resume cheaply with
   `"$PIDEV" order <same-id> "continue and finish; emit READY_FOR_ORCHESTRATOR_REVIEW"`; do
   not start a fresh id because the work-so-far is in that session. `EMPTY_OR_INSTANT_RUN`
   means startup death with no meaningful tools; retry once with a FRESH id, then stop and
   report if it repeats. Neither signal counts as an engineering/model retry.
   `NO_TREE_CHANGES` remains suspect for coding tasks. `PIDEV_LENIENT=1` bypasses these checks
   for read-only Q&A runs.
4. **Evidence, not "complete"** — tell the worker to end its report with
   `READY_FOR_ORCHESTRATOR_REVIEW` plus: changed files, migrations generated by command,
   exact tests run with pass/fail, surfaces implemented, known gaps, and whether
   `git status --short` is clean. `wait` prints a note when the sentinel is missing. Only the
   orchestrator declares a phase complete, after independent gates.
5. **Split big integrations** — for conflicted cherry-picks, never one mega-order. Sequence:
   ① resolve conflicts ONLY (verify zero `<<<<<<<`/`>>>>>>>` markers) → ② make typecheck pass →
   ③ regenerate migrations (`npm run db:generate`; delete stale imported .sql/snapshots first;
   prove journal count == sql count) → ④ implement spec gaps/tests → ⑤ gates + evidence report.
   Give each order the exact first command to run.

## Worker prompt hardening from R2 field failures

Add these bullets to Release 2 phase prompts and correction orders. They keep pidev doing the
implementation work while reducing orchestrator cleanup:

- Do not use `timeout`; macOS does not provide GNU `timeout` here. Run commands directly, or use
  the wrapper/orchestrator wait loop.
- Treat `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, smoke, hardcoding,
  secret-scan, migration, and `git diff --check` nonzero exits as phase failures. Do not label
  them "pre-existing" unless you show the exact failing output and a before/after comparison.
- Test the actual page/route payload consumed by the UI, not only the newly added service or API
  helper. If a page uses `getCourseForMember`, `getEventForMember`, feed projections, or another
  existing adapter, add a regression through that adapter too.
- For admin authoring surfaces, list every required control in the final evidence and add focused
  tests/greps for each: create/edit, reorder/sort, media asset id or upload-backed field, status
  toggles, destructive action, and tenant-scope guard.
- If a phase has locks/drip/entitlements/privacy, enforce them at both read payload and mutation
  paths. A locked page body plus an unlocked completion/write endpoint is not acceptable.
- For async payment, entitlement, referral, payout, moderation, notification, or webhook lifecycles,
  test the full state transition chain, not only the initial create event. Include at least one
  regression for delayed follow-up events that must connect back to earlier pending state, such as
  checkout-created attribution followed by the first positive invoice, retry/dunning recovery,
  refund/revoke, payout mark-paid, moderation approve/void, or notification delivery callbacks.
- For public/SEO or client-fetching pages, run a live local smoke against the actual page and API
  after tests: `curl -i` the API route, open the page at 375px, confirm real data or the intended
  empty/error state renders, and check there is no infinite refetch loop or permanent loading shell.
  Public crawlable pages should server-render their initial content whenever practical; client-only
  loading shells are not enough evidence for SEO surfaces.
- Normalize Postgres aggregate values (`count`, `sum`, calculated ranks) before response-schema
  validation. The pg driver can return aggregate numerics as strings even when TypeScript says
  `number`; browser/API smoke should catch this before the orchestrator does.
- The final report must include one "Actual surfaces checked" list naming concrete page files,
  API route files, service adapters, and tests, plus gaps that still need orchestrator review.
- Before emitting `READY_FOR_ORCHESTRATOR_REVIEW`, run a worker-side self-review matrix and include
  it in the final report. The matrix must have one row per REQUIRED surface/gate with columns:
  required artifact, implemented file/function, verification command or grep, result, and residual
  gap. If any required row is missing, unverified, or failed, keep working instead of asking the
  orchestrator to discover it. This is especially important for phases with page + API + service
  requirements, where a service-only implementation is a failed phase.
