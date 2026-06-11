#!/usr/bin/env bash
# pidev.sh — orchestrate the pi.dev coding agent (`pi`) as a delegated worker.  (v2, 2026-06-11)
#
# Dispatch a coding task to pidev in any project, poll it, read its real
# transcript, and send follow-up orders that RESUME the same session with full
# context. Built around `pi -p --session-id <id>` (create-if-missing, else
# resume) so one stable id == one ongoing conversation with the worker.
#
# v2 hardening (post stale-session incident):
#   * dispatch FAILS if the session already exists (SESSION_EXISTS_USE_ORDER_OR_NEW_ID, exit 4)
#     unless --resume is passed. Fresh attempt => fresh id. `order` still resumes.
#   * dispatch FAILS on a dirty/conflicted tree (DIRTY_TREE_USE_ALLOW_DIRTY, exit 5) unless
#     --allow-dirty is passed; when passed, the task prompt MUST tell the worker it is
#     resolving the current worktree, not starting from scratch.
#   * launch records a pre-run tree fingerprint; `wait` detects empty/instant/no-op runs
#     (EMPTY_OR_INSTANT_RUN, exit 3) instead of returning DONE on a dead transcript.
#     Set PIDEV_LENIENT=1 to bypass (e.g. legit read-only Q&A runs).
#   * `wait` warns (non-fatal) when the final report lacks the READY_FOR_ORCHESTRATOR_REVIEW
#     evidence sentinel — workers should report evidence, orchestrators decide "complete".
#   * headless runs always pass --exclude-tools todo (the rpiv-todo overlay kills `pi -p`).
#
# Subcommands:
#   dispatch <id> "<task>" [--model M] [--thinking T] [--cwd DIR] [--approve] [--cheap] [--max] [--resume] [--allow-dirty]
#   order    <id> "<order>" [same flags; dirty tree allowed by nature]
#   dispatch-file <id> <prompt-file> [same flags]
#   order-file    <id> <prompt-file> [same flags]
#   status   <id>
#   report   <id>            full final report (last assistant message)
#   tail     <id> [n]        last n turns of the transcript
#   wait     <id> [maxsec]   block until the run finishes (default 3600s); quality-gates the result
#   cost     <id>            $ spent, tokens, cache-hit %, duration, turns, model
#   diff     <id>            git status + diff --stat + new files in the session cwd (verify)
#   stop     <id>            kill a running session (transcript preserved)
#   list                     list known orchestrated sessions
#   selftest                 no-cost parser/wrapper smoke test (no pi API call)
#   preflight <id> [cwd]     no-cost readiness gate before spending a fresh phase run
#
# Notes:
#   * macOS has no `timeout`; this uses background + poll throughout.
#   * pi runs with the user's full config (tools, skills, MCP, AGENTS.md model
#     policy: deepseek-v4-pro default). For non-deepseek models use provider/id form.
#   * The dispatched agent has read/bash/edit/write in the target project — it
#     edits files and runs commands autonomously. Prefer a git repo.
set -euo pipefail

PI_BIN="${PIDEV_BIN:-/opt/homebrew/bin/pi}"
SESSIONS_ROOT="$HOME/.pi/agent/sessions"
ORCH_ROOT="$HOME/.pidev-orchestrator"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARSER="$HERE/parse_session.py"

die() { echo "ERROR: $*" >&2; exit 2; }

find_session_file() {
  # echo absolute path of the session JSONL for <id>, or nothing.
  local sid="$1" meta="$ORCH_ROOT/$1" rec
  if [ -f "$meta/session_file" ]; then
    rec="$(cat "$meta/session_file" 2>/dev/null || true)"
    if [ -n "$rec" ] && [ -f "$rec" ]; then echo "$rec"; return 0; fi
  fi
  ls -t "$SESSIONS_ROOT"/*/*_"$sid".jsonl 2>/dev/null | head -1 || true
}

latest_run_log() {
  local meta="$ORCH_ROOT/$1"
  ls -t "$meta"/run-*.log 2>/dev/null | head -1 || true
}

transcript_file() {
  # For --mode json runs, stdout log contains the full tool-continuation transcript.
  # The saved session JSONL is still needed for pi --session resume, but can stop at
  # the first tool result for headless exact-id runs.
  local sid="$1" log sfile
  log="$(latest_run_log "$sid")"
  if [ -n "$log" ] && [ -s "$log" ]; then echo "$log"; return 0; fi
  sfile="$(find_session_file "$sid")"
  [ -n "$sfile" ] && echo "$sfile"
}

is_running() {
  local meta="$ORCH_ROOT/$1" pid
  [ -f "$meta/pid" ] || return 1
  pid="$(cat "$meta/pid" 2>/dev/null || true)"
  [ -n "$pid" ] || return 1
  kill -0 "$pid" 2>/dev/null
}

tree_fingerprint() {
  # cheap whole-tree state hash: status of tracked+untracked (minus ignored)
  git -C "$1" status --porcelain=v1 -uall 2>/dev/null | shasum 2>/dev/null | cut -d' ' -f1
}

preflight_cmd() {
  local sid="${1:-}" cwd="${2:-$PWD}" failures=0 existing="" dirty_count=0 conflict_files="" pi_live="" selftest_log=""
  [ -n "$sid" ] || die "usage: preflight <fresh-session-id> [cwd]"
  [ -d "$cwd" ] || die "cwd does not exist: $cwd"

  echo "=== pidev preflight ==="
  echo "session-id : $sid"
  echo "cwd        : $cwd"

  if [ -x "$PI_BIN" ]; then
    echo "PASS pi binary executable: $PI_BIN"
  else
    echo "FAIL pi binary not executable: $PI_BIN"
    failures=$((failures + 1))
  fi

  selftest_log="$(mktemp "${TMPDIR:-/tmp}/pidev-preflight-selftest.XXXXXX")"
  if bash "$HERE/$(basename "$0")" selftest >"$selftest_log" 2>&1; then
    echo "PASS wrapper selftest"
  else
    echo "FAIL wrapper selftest"
    sed -n '1,80p' "$selftest_log"
    failures=$((failures + 1))
  fi
  rm -f "$selftest_log"

  existing="$(find_session_file "$sid")"
  if [ -n "$existing" ]; then
    echo "FAIL fresh session id already exists: $existing"
    echo "  use a new id for a fresh phase attempt, or use order/resume intentionally"
    return 4
  fi
  echo "PASS fresh session id"

  pi_live="$(pgrep -x pi 2>/dev/null || pgrep -f pi-coding 2>/dev/null || true)"
  if [ -n "$pi_live" ]; then
    echo "WARN live pi worker(s) elsewhere: $pi_live"
    echo "PASS per-tree worker isolation is enforced at dispatch by TREE_BUSY"
  else
    echo "PASS no live pi worker"
  fi

  if git -C "$cwd" rev-parse --git-dir >/dev/null 2>&1; then
    dirty_count="$(git -C "$cwd" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
    conflict_files="$(git -C "$cwd" grep -lE '^(<<<<<<< |>>>>>>> )' -- ':!node_modules' 2>/dev/null | head -10 || true)"
    if [ "$dirty_count" != "0" ] || [ -n "$conflict_files" ]; then
      echo "FAIL dirty/conflicted tree"
      git -C "$cwd" status --short 2>/dev/null | head -20
      if [ -n "$conflict_files" ]; then
        echo "CONFLICT MARKERS:"
        printf '  %s\n' $conflict_files
      fi
      return 5
    fi
    echo "PASS clean git tree"
  else
    echo "WARN cwd is not a git repo; dirty-tree gate skipped"
  fi

  if [ "$failures" -ne 0 ]; then
    echo "PREFLIGHT FAILED ($failures failure(s))"
    return 2
  fi
  echo "PREFLIGHT PASSED"
}

launch() {
  local mode="$1"; shift
  local sid="${1:-}"; shift || true
  local task="${1:-}"; shift || true
  local model="" thinking="" cwd="$PWD" approve="" cheap="" resume="" allowdirty=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --model)       model="${2:-}"; shift 2 ;;
      --thinking)    thinking="${2:-}"; shift 2 ;;
      --cwd)         cwd="${2:-}"; shift 2 ;;
      --approve)     approve="--approve"; shift ;;
      --cheap)       cheap=1; shift ;;
      --max)         thinking="${thinking:-xhigh}"; shift ;;
      --resume)      resume=1; shift ;;
      --allow-dirty) allowdirty=1; shift ;;
      *) die "unknown flag: $1" ;;
    esac
  done
  # Model routing per task: --cheap => deepseek-v4-flash (trivial/throwaway);
  # else the settings default (deepseek-v4-pro). --max bumps reasoning to xhigh.
  if [ -n "$cheap" ]; then
    model="${model:-deepseek-v4-flash}"
    thinking="${thinking:-off}"
  fi
  [ -n "$sid" ]  || die "session-id required"
  [ -n "$task" ] || die "task/order text required (quote it)"
  [ -x "$PI_BIN" ] || die "pi binary not found/executable at $PI_BIN (set PIDEV_BIN)"
  [ -d "$cwd" ] || die "cwd does not exist: $cwd"

  local meta="$ORCH_ROOT/$sid"
  mkdir -p "$meta"

  # ── v2 gate 1: fresh means fresh ─────────────────────────────────────────
  local existing; existing="$(find_session_file "$sid")"
  if [ "$mode" = "dispatch" ] && [ -n "$existing" ] && [ -z "$resume" ]; then
    echo "ERROR: SESSION_EXISTS_USE_ORDER_OR_NEW_ID" >&2
    echo "  session '$sid' already has a transcript: $existing" >&2
    echo "  A resumed transcript can return a STALE 'complete' report from an old attempt." >&2
    echo "  Use a NEW session-id for a fresh attempt, '$(basename "$0") order $sid \"...\"' to" >&2
    echo "  continue this one, or pass --resume to deliberately resume via dispatch." >&2
    exit 4
  elif [ "$mode" = "order" ] && [ -z "$existing" ]; then
    echo "WARNING: no existing session '$sid' — this order starts a fresh session." >&2
  fi

  # ── v2 gate 2: dirty/conflict-aware preflight ────────────────────────────
  local dirty_count=0 conflict_files="" pi_live=""
  if git -C "$cwd" rev-parse --git-dir >/dev/null 2>&1; then
    dirty_count="$(git -C "$cwd" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
    conflict_files="$(git -C "$cwd" grep -lE '^(<<<<<<< |>>>>>>> )' -- ':!node_modules' 2>/dev/null | head -10 || true)"
  fi
  pi_live="$(pgrep -x pi 2>/dev/null || pgrep -f pi-coding 2>/dev/null || true)"
  echo "── preflight ──────────────────────────────────────────────"
  echo "  cwd            : $cwd"
  echo "  dirty files    : $dirty_count"
  if [ -n "$conflict_files" ]; then
    echo "  CONFLICT MARKERS in:"; printf '    %s\n' $conflict_files
  fi
  echo "  live pi worker : ${pi_live:-none}"
  echo "───────────────────────────────────────────────────────────"
  # v3 PARALLEL — per-TREE lock, not a global one. Workers on DIFFERENT trees/projects run
  # concurrently; only a second worker targeting the SAME working tree is refused. This is what lets
  # you + Codex run pidev across projects/branches at the same time. (`pi_live` above stays as an
  # informational line only.)
  mkdir -p "$ORCH_ROOT/locks"
  local tree_key tree_lock
  tree_key="$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null || echo "$cwd")"
  tree_lock="$ORCH_ROOT/locks/$(printf '%s' "$tree_key" | shasum 2>/dev/null | cut -c1-16).lock"
  if [ -f "$tree_lock" ]; then
    local lk_pid lk_sid; lk_pid="$(awk '{print $1}' "$tree_lock" 2>/dev/null)"; lk_sid="$(awk '{print $2}' "$tree_lock" 2>/dev/null)"
    if [ -n "$lk_pid" ] && kill -0 "$lk_pid" 2>/dev/null; then
      die "TREE_BUSY — a pi worker (pid $lk_pid, session '$lk_sid') is already editing this tree:
  $tree_key
  One writer per tree. To run in parallel, use a different project (--cwd) or a separate git worktree
  for another branch; or stop that session first."
    fi
    rm -f "$tree_lock"   # stale (its pid is dead) — reclaim
  fi
  if [ "$mode" = "dispatch" ] && [ -z "$allowdirty" ] && { [ "$dirty_count" != "0" ] || [ -n "$conflict_files" ]; }; then
    echo "ERROR: DIRTY_TREE_USE_ALLOW_DIRTY" >&2
    git -C "$cwd" status --short 2>/dev/null | head -12 >&2
    echo "  The tree is dirty/conflicted. Either commit/stash first, or re-dispatch with" >&2
    echo "  --allow-dirty AND make the task prompt say explicitly:" >&2
    echo "  'You are resolving the CURRENT worktree, not starting from scratch. Preserve unrelated changes.'" >&2
    exit 5
  fi

  local args=(-p --mode json --exclude-tools todo)
  if [ -n "$existing" ]; then
    args+=(--session "$existing")
  else
    args+=(--name "$sid")
  fi
  [ -n "$model" ]    && args+=(--model "$model")
  [ -n "$thinking" ] && args+=(--thinking "$thinking")
  [ -n "$approve" ]  && args+=("$approve")

  local stamp; stamp="$(date +%Y%m%dT%H%M%S)"
  local log="$meta/run-$stamp.log"
  printf '%s\n' "$cwd"                > "$meta/cwd"
  printf '%s\n' "${model:-<default>}" > "$meta/model"
  printf '%s\n' "$task"               > "$meta/last_order"
  date +%s                            > "$meta/launched_at"
  tree_fingerprint "$cwd"             > "$meta/pre_tree_hash" 2>/dev/null || true
  local marker="$meta/launch_marker"
  : > "$marker"

  local pid=""
  if [ "${PIDEV_DETACH:-0}" = "1" ]; then
    # Legacy detached mode. Kept as an escape hatch, but foreground is the default
    # because pi 0.79.1 can stop after tool results when orphaned under nohup.
    ( cd "$cwd" && exec nohup "$PI_BIN" "${args[@]}" "$task" >"$log" 2>&1 </dev/null ) &
    pid=$!
    printf '%s\n' "$pid" > "$meta/pid"
  else
    # Foreground execution keeps pi alive for the second model call after tool
    # results. Codex can still let this command run as a long-lived shell session.
    ( cd "$cwd" && nohup "$PI_BIN" "${args[@]}" "$task" >"$log" 2>&1 </dev/null ) &
    pid=$!
    printf '%s\n' "$pid" > "$meta/pid"
    wait "$pid" || true
  fi
  # Hold the per-tree lock with this worker's pid (released by stale-detection on the next dispatch,
  # or by `stop`). Lets concurrent dispatches to OTHER trees proceed while this tree is claimed.
  printf '%s %s\n' "$pid" "$sid" > "$tree_lock" 2>/dev/null || true

  # Wait briefly for the session file to appear (startup loads skills/MCP).
  local sfile=""
  local i
  for i in $(seq 1 60); do
    sfile="$(find_session_file "$sid")"
    if [ -z "$sfile" ]; then
      sfile="$(find "$SESSIONS_ROOT" -type f -name '*.jsonl' -newer "$marker" -exec ls -t {} + 2>/dev/null | head -1 || true)"
    fi
    [ -n "$sfile" ] && break
    if ! kill -0 "$pid" 2>/dev/null; then
      sleep 1; sfile="$(find_session_file "$sid")"; break
    fi
    sleep 0.5
  done
  [ -n "$sfile" ] && printf '%s\n' "$sfile" > "$meta/session_file"

  local label; label="$(printf '%s' "$mode" | tr '[:lower:]' '[:upper:]')"
  echo "=== ${label}ED ==="
  echo "session-id : $sid"
  echo "pid        : $pid"
  echo "cwd        : $cwd"
  echo "model      : ${model:-default (deepseek-v4-pro per settings)}"
  echo "log        : $log"
  echo "session    : ${sfile:-<not created yet — check status>}"
  echo
  echo "Order sent : $task"
  echo
  if kill -0 "$pid" 2>/dev/null; then
    echo "STATUS     : running. Poll with:  pidev.sh status $sid"
    echo "             Block with:           pidev.sh wait $sid   (good for background)"
  else
    echo "STATUS     : process finished — inspect:  pidev.sh report $sid  (and tail $log)"
  fi
}

launch_file() {
  local mode="$1"; shift
  local sid="${1:-}"; shift || true
  local prompt_file="${1:-}"; shift || true
  [ -n "$sid" ] || die "session-id required"
  [ -n "$prompt_file" ] || die "prompt file required"
  [ -r "$prompt_file" ] || die "prompt file not readable: $prompt_file"
  local task
  task="$(cat "$prompt_file")"
  [ -n "$task" ] || die "prompt file is empty: $prompt_file"
  launch "$mode" "$sid" "$task" "$@"
}

status() {
  local sid="${1:-}"; [ -n "$sid" ] || die "usage: status <id>"
  local meta="$ORCH_ROOT/$sid"
  [ -d "$meta" ] || die "no orchestrated session '$sid' (use: pidev.sh list)"
  local sfile; sfile="$(transcript_file "$sid")"
  echo "session-id : $sid"
  echo "cwd        : $(cat "$meta/cwd" 2>/dev/null || echo '?')"
  echo "model      : $(cat "$meta/model" 2>/dev/null || echo '?')"
  echo "session    : ${sfile:-<none yet>}"
  if is_running "$sid"; then
    echo "state      : RUNNING (pid $(cat "$meta/pid"))"
  else
    echo "state      : FINISHED"
  fi
  if [ -n "$sfile" ]; then
    echo "msgs       : $(python3 "$PARSER" count "$sfile" 2>/dev/null || echo '?')"
    echo "updated    : $(date -r "$sfile" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo '?')"
    echo "--- latest assistant text ---"
    python3 "$PARSER" last "$sfile"
  fi
  if ! is_running "$sid"; then
    local log; log="$(latest_run_log "$sid")"
    if [ -n "$log" ]; then
      echo "--- log tail (errors land here) ---"
      tail -n 6 "$log" 2>/dev/null || true
    fi
  fi
}

report() {
  local sid="${1:-}"; [ -n "$sid" ] || die "usage: report <id>"
  local sfile; sfile="$(transcript_file "$sid")"
  [ -n "$sfile" ] || die "no transcript file for '$sid' yet"
  if is_running "$sid"; then
    echo "(NOTE: run still in progress — this is the latest assistant message, not necessarily final)"
    echo
  fi
  python3 "$PARSER" report "$sfile"
}

tail_t() {
  local sid="${1:-}"; [ -n "$sid" ] || die "usage: tail <id> [n]"
  local n="${2:-14}"
  local sfile; sfile="$(transcript_file "$sid")"
  [ -n "$sfile" ] || die "no transcript file for '$sid' yet"
  python3 "$PARSER" tail "$sfile" "$n"
}

wait_done() {
  local sid="${1:-}"; [ -n "$sid" ] || die "usage: wait <id> [maxsec]"
  local max="${2:-3600}" waited=0
  local meta="$ORCH_ROOT/$sid"
  while is_running "$sid"; do
    sleep 5; waited=$((waited + 5))
    if [ "$waited" -ge "$max" ]; then
      echo "TIMEOUT: '$sid' still running after ${max}s"; return 1
    fi
  done
  echo "DONE: '$sid' finished after ~${waited}s"

  # ── v2 gate 3: empty/instant/no-op run detection ─────────────────────────
  local sfile msgs rep cwd pre_hash post_hash tree_changed="?"
  sfile="$(transcript_file "$sid")"
  msgs="$(python3 "$PARSER" count "$sfile" 2>/dev/null || echo 0)"
  rep="$(python3 "$PARSER" report "$sfile" 2>/dev/null || true)"
  cwd="$(cat "$meta/cwd" 2>/dev/null || true)"
  pre_hash="$(cat "$meta/pre_tree_hash" 2>/dev/null || true)"
  if [ -n "$cwd" ] && [ -n "$pre_hash" ]; then
    post_hash="$(tree_fingerprint "$cwd" 2>/dev/null || true)"
    if [ "$pre_hash" = "$post_hash" ]; then tree_changed="NO"; else tree_changed="yes"; fi
  fi
  local rep_trim; rep_trim="$(printf '%s' "$rep" | tr -d '[:space:]')"
  # shape: did the worker run tools, and did it close with a final assistant text message?
  local shape tool_calls final_text
  shape="$(python3 "$PARSER" shape "$sfile" 2>/dev/null || true)"
  tool_calls="$(printf '%s' "$shape" | sed -n 's/.*tool_calls=\([0-9]\).*/\1/p')"
  final_text="$(printf '%s' "$shape" | sed -n 's/.*final_text=\([0-9]\).*/\1/p')"
  if [ -z "${PIDEV_LENIENT:-}" ]; then
    if [ -z "$rep_trim" ] || { [ "${msgs:-0}" -lt 5 ] && [ "${final_text:-0}" = "0" ]; }; then
      local log; log="$(latest_run_log "$sid")"
      if [ "${tool_calls:-0}" = "1" ] && [ "${final_text:-0}" = "0" ]; then
        echo "ERROR: DIED_MID_RUN — worker ran tools then died before its final message (likely a transient API blip), NOT a model failure." >&2
        echo "  msgs=$msgs  tool_calls=yes  final_text=no  tree-changed=$tree_changed" >&2
        echo "  Cheapest recovery — resume in place (work-so-far is already in the session context):" >&2
        echo "    $(basename "$0") order $sid \"continue and finish; produce the READY_FOR_ORCHESTRATOR_REVIEW evidence report\"" >&2
        echo "  A fresh dispatch throws that context away — only do that if a resume also dies." >&2
        echo "  session: ${sfile:-<none>}" >&2
        if [ -n "$log" ]; then echo "  --- log tail ---" >&2; tail -n 10 "$log" >&2 || true; fi
        exit 3
      fi
      echo "ERROR: EMPTY_OR_INSTANT_RUN — do NOT treat this as a model failure or a usable result." >&2
      echo "  msgs=$msgs  report-empty=$([ -z "$rep_trim" ] && echo yes || echo no)  tree-changed=$tree_changed" >&2
      echo "  session: ${sfile:-<none>}" >&2
      if [ -n "$log" ]; then echo "  --- log tail ---" >&2; tail -n 10 "$log" >&2 || true; fi
      echo "  Likely tooling (session/startup) issue. Retry with a FRESH session id;" >&2
      echo "  if it repeats, stop and report — don't burn retries on it. (PIDEV_LENIENT=1 to bypass.)" >&2
      exit 3
    fi
    if [ "$tree_changed" = "NO" ]; then
      echo "WARNING: NO_TREE_CHANGES — the worker made zero edits in $cwd." >&2
      echo "  Fine for read-only/Q&A tasks; for a coding task treat the report as suspect." >&2
    fi
  fi
  case "$rep" in
    *READY_FOR_ORCHESTRATOR_REVIEW*) : ;;
    *) echo "NOTE: report lacks the READY_FOR_ORCHESTRATOR_REVIEW evidence sentinel —" >&2
       echo "      verify extra carefully (changed files, tests run, migrations, gaps)." >&2 ;;
  esac

  echo "--- final report ---"
  report "$sid"
}

cost() {
  local sid="${1:-}"; [ -n "$sid" ] || die "usage: cost <id>"
  local sfile; sfile="$(transcript_file "$sid")"
  [ -n "$sfile" ] || die "no transcript file for '$sid' yet"
  echo "session-id : $sid"
  python3 "$PARSER" cost "$sfile"
}

# Ground-truth verify: show what pidev actually changed in its project dir.
diff_cmd() {
  local sid="${1:-}"; [ -n "$sid" ] || die "usage: diff <id>"
  local meta="$ORCH_ROOT/$sid" cwd
  cwd="$(cat "$meta/cwd" 2>/dev/null || true)"
  [ -n "$cwd" ] && [ -d "$cwd" ] || die "no recorded cwd for '$sid'"
  echo "cwd: $cwd"
  echo "--- git status --short ---"
  git -C "$cwd" status --short 2>/dev/null || echo "(not a git repo)"
  echo "--- git diff --stat ---"
  git -C "$cwd" diff --stat 2>/dev/null | tail -40
  echo "--- untracked (new files) ---"
  git -C "$cwd" ls-files --others --exclude-standard 2>/dev/null | grep -v node_modules | head -40
}

# Interfere: stop a running pidev session (e.g. it's looping or off-track).
stop() {
  local sid="${1:-}"; [ -n "$sid" ] || die "usage: stop <id>"
  local meta="$ORCH_ROOT/$sid" pid
  pid="$(cat "$meta/pid" 2>/dev/null || true)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    # kill the detached pi and any child node/electron it spawned
    pkill -P "$pid" 2>/dev/null || true
    kill "$pid" 2>/dev/null || true
    sleep 1
    kill -9 "$pid" 2>/dev/null || true
    echo "STOPPED '$sid' (pid $pid). Session transcript preserved — resume with: pidev.sh order $sid \"...\""
    echo "Verify it is really dead before any git operation:  pgrep -x pi || pgrep -f pi-coding"
  else
    echo "'$sid' is not running (nothing to stop)."
  fi
}

list_sessions() {
  [ -d "$ORCH_ROOT" ] || { echo "(no orchestrated sessions yet)"; return 0; }
  local d sid st
  for d in "$ORCH_ROOT"/*/; do
    [ -d "$d" ] || continue
    sid="$(basename "$d")"
    if is_running "$sid"; then st="RUNNING"; else st="finished"; fi
    printf '%-28s %-9s %s\n' "$sid" "$st" "$(cat "$d/cwd" 2>/dev/null || echo '?')"
  done
}

selftest() {
  local tmp oklog diedlog emptylog report count shape cost_out failures=0
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/pidev-selftest.XXXXXX")"
  trap 'rm -rf "$tmp"' RETURN
  oklog="$tmp/ok.jsonl"
  diedlog="$tmp/died.jsonl"
  emptylog="$tmp/empty.jsonl"

  printf '%s\n' \
    '{"timestamp":"2026-06-11T00:00:00Z","type":"message","message":{"role":"user","content":[{"type":"text","text":"selftest"}]}}' \
    '{"timestamp":"2026-06-11T00:00:01Z","type":"message","message":{"role":"assistant","model":"deepseek-v4-pro","usage":{"input":10,"output":4,"cacheRead":90,"cacheWrite":0,"cost":{"total":0.0012}},"content":[{"type":"text","text":"READY_FOR_ORCHESTRATOR_REVIEW selftest ok"}]}}' \
    > "$oklog"

  printf '%s\n' \
    '{"timestamp":"2026-06-11T00:00:00Z","type":"message","message":{"role":"assistant","content":[{"type":"toolCall","toolName":"bash"}]}}' \
    '{"timestamp":"2026-06-11T00:00:01Z","type":"message","message":{"role":"toolResult","toolName":"bash","content":[{"type":"text","text":"ran"}]}}' \
    > "$diedlog"
  : > "$emptylog"

  report="$(python3 "$PARSER" report "$oklog" 2>/dev/null || true)"
  count="$(python3 "$PARSER" count "$oklog" 2>/dev/null || true)"
  shape="$(python3 "$PARSER" shape "$diedlog" 2>/dev/null || true)"
  cost_out="$(python3 "$PARSER" cost "$oklog" 2>/dev/null || true)"

  echo "=== pidev wrapper selftest ==="
  if [ -x "$PI_BIN" ]; then
    echo "PASS pi binary executable: $PI_BIN"
  else
    echo "WARN pi binary not executable: $PI_BIN"
  fi

  if [ "$report" = "READY_FOR_ORCHESTRATOR_REVIEW selftest ok" ]; then
    echo "PASS parser report"
  else
    echo "FAIL parser report: $report"; failures=$((failures + 1))
  fi

  if [ "$count" = "2" ]; then
    echo "PASS parser count"
  else
    echo "FAIL parser count: $count"; failures=$((failures + 1))
  fi

  if printf '%s' "$shape" | grep -q "tool_calls=1 final_text=0"; then
    echo "PASS parser shape detects DIED_MID_RUN"
  else
    echo "FAIL parser shape: $shape"; failures=$((failures + 1))
  fi

  if printf '%s' "$cost_out" | grep -q 'cost        : $0.0012'; then
    echo "PASS parser cost"
  else
    echo "FAIL parser cost:"; printf '%s\n' "$cost_out"; failures=$((failures + 1))
  fi

  if [ "$(python3 "$PARSER" count "$emptylog" 2>/dev/null || echo x)" = "0" ]; then
    echo "PASS parser empty transcript"
  else
    echo "FAIL parser empty transcript"; failures=$((failures + 1))
  fi

  if [ "$failures" -ne 0 ]; then
    echo "SELFTEST FAILED ($failures failure(s))"
    return 1
  fi
  echo "SELFTEST PASSED"
}

cmd="${1:-}"; shift || true
case "$cmd" in
  dispatch) launch dispatch "$@" ;;
  order)    launch order "$@" ;;
  dispatch-file) launch_file dispatch "$@" ;;
  order-file)    launch_file order "$@" ;;
  status)   status "$@" ;;
  report)   report "$@" ;;
  tail)     tail_t "$@" ;;
  cost)     cost "$@" ;;
  diff)     diff_cmd "$@" ;;
  stop)     stop "$@" ;;
  wait)     wait_done "$@" ;;
  list)     list_sessions ;;
  selftest) selftest "$@" ;;
  preflight) preflight_cmd "$@" ;;
  *)
    echo "usage: pidev.sh <dispatch|order|dispatch-file|order-file|status|report|tail|cost|diff|stop|wait|list|selftest|preflight> ..." >&2
    echo "  dispatch <id> \"task\" [--model M] [--thinking T] [--cwd DIR] [--approve] [--cheap] [--max] [--resume] [--allow-dirty]" >&2
    echo "  order    <id> \"order\" [same flags]   # resumes the session with full context" >&2
    echo "  dispatch-file <id> <prompt-file> [same flags]   # avoids shell quoting/glob issues" >&2
    echo "  order-file    <id> <prompt-file> [same flags]" >&2
    echo "  status <id> | report <id> | tail <id> [n] | cost <id> | diff <id> | stop <id> | wait <id> [maxsec] | list | selftest | preflight <id> [cwd]" >&2
    echo "  exit codes: 2=usage  3=EMPTY_OR_INSTANT_RUN  4=SESSION_EXISTS_USE_ORDER_OR_NEW_ID  5=DIRTY_TREE_USE_ALLOW_DIRTY" >&2
    exit 2 ;;
esac
