#!/usr/bin/env python3
"""Parse a pi.dev session JSONL transcript.

The session file is the source of truth for what pidev actually did — its stdout
is often empty in headless (-p) mode. Each line is a JSON object; messages have
type=="message" with a nested {role, content[]} where content blocks are of type
text / thinking / toolCall (assistant) or text (user, toolResult).

Modes:
  report <file>        Full text of the LAST assistant message (the final answer/report)
  last <file>          Last assistant message text, truncated (~800 chars) for a status peek
  tail <file> [n]      Last n turns rendered compactly (default 14)
  count <file>         Number of message events (rough progress signal)
  cost <file>          $ spent, tokens, cache-hit %, duration, turns, model(s)
"""
import sys
import json
import datetime


def load(path):
    msgs = []
    last_stream_text = ""
    try:
        f = open(path, errors="replace")
    except OSError:
        return msgs
    with f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except Exception:
                continue
            if d.get("type") in ("message", "message_end") and isinstance(d.get("message"), dict):
                msgs.append(d["message"])
            elif d.get("type") == "message_update":
                ev = d.get("assistantMessageEvent") or {}
                msg = ev.get("message") or d.get("message") or {}
                if isinstance(msg, dict):
                    stream_text = text_of(msg)
                    if stream_text:
                        last_stream_text = stream_text
                if ev.get("type") == "text_end" and ev.get("content"):
                    msgs.append({"role": "assistant", "content": [{"type": "text", "text": ev["content"]}]})
            elif d.get("type") == "agent_end" and isinstance(d.get("messages"), list):
                msgs.extend(m for m in d["messages"] if isinstance(m, dict))
    if last_stream_text and last_assistant_text(msgs) != last_stream_text:
        msgs.append({"role": "assistant", "content": [{"type": "text", "text": last_stream_text}]})
    return msgs


def load_raw(path):
    """Full event objects (keeps top-level timestamp + nested message.usage)."""
    rows = []
    try:
        f = open(path, errors="replace")
    except OSError:
        return rows
    with f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except Exception:
                continue
    return rows


def cost_report(path):
    rows = load_raw(path)
    cost = tin = tout = tcr = tcw = turns = 0
    models = set()
    times = []
    for e in rows:
        if e.get("timestamp"):
            try:
                times.append(datetime.datetime.fromisoformat(e["timestamp"].replace("Z", "+00:00")))
            except Exception:
                pass
        m = e.get("message") or {}
        if m.get("role") == "assistant":
            turns += 1
        u = m.get("usage") or {}
        if u:
            if m.get("model"):
                models.add(m["model"])
            c = u.get("cost") or {}
            cost += c.get("total", 0) or 0
            tin += u.get("input", 0) or 0
            tout += u.get("output", 0) or 0
            tcr += u.get("cacheRead", 0) or 0
            tcw += u.get("cacheWrite", 0) or 0
    dur = (max(times) - min(times)).total_seconds() / 60 if len(times) >= 2 else 0
    hit = (100 * tcr / (tcr + tin)) if (tcr + tin) else 0
    print(f"model(s)    : {', '.join(sorted(models)) or '?'}")
    print(f"cost        : ${cost:.4f}")
    print(f"duration    : {dur:.1f} min")
    print(f"assistant turns: {turns}")
    print(f"tokens      : in={tin:,} out={tout:,} cacheRead={tcr:,} cacheWrite={tcw:,}")
    print(f"cache-hit   : {hit:.1f}%  (cacheRead / (cacheRead+freshInput))")


def text_of(msg):
    out = []
    content = msg.get("content")
    if isinstance(content, str):
        return content.strip()
    for b in content or []:
        if isinstance(b, dict) and b.get("type") == "text" and b.get("text"):
            out.append(b["text"])
    return "\n".join(out).strip()


def last_assistant_text(msgs):
    for m in reversed(msgs):
        if m.get("role") == "assistant":
            t = text_of(m)
            if t:
                return t
    return ""


def main():
    if len(sys.argv) < 3:
        print("usage: parse_session.py <report|last|tail|count|cost> <file> [n]", file=sys.stderr)
        sys.exit(2)
    mode, path = sys.argv[1], sys.argv[2]
    msgs = load(path)

    if mode == "report":
        t = last_assistant_text(msgs)
        print(t if t else "(no assistant text found yet — run may still be starting)")

    elif mode == "last":
        t = last_assistant_text(msgs)
        print((t[:800] + ("…" if len(t) > 800 else "")) if t else "(no assistant text yet)")

    elif mode == "tail":
        n = int(sys.argv[3]) if len(sys.argv) > 3 else 14
        for m in msgs[-n:]:
            role = m.get("role")
            if role == "assistant":
                t = text_of(m)
                if t:
                    print(f"[assistant] {t[:500]}")
                for b in m.get("content", []) or []:
                    if isinstance(b, dict) and b.get("type") == "toolCall":
                        print(f"  -> tool: {b.get('toolName', '?')}")
            elif role == "toolResult":
                tn = m.get("toolName", "?")
                first = ""
                for b in m.get("content", []) or []:
                    if isinstance(b, dict) and b.get("type") == "text":
                        lines = (b.get("text", "") or "").splitlines()
                        first = (lines[0] if lines else "")[:120]
                        break
                print(f"[tool:{tn}] {first}")
            elif role == "user":
                print(f"[user] {text_of(m)[:300]}")

    elif mode == "count":
        print(len(msgs))

    elif mode == "cost":
        cost_report(path)

    elif mode == "shape":
        # Distinguish a mid-run death (tools ran, no closing assistant text) from an
        # empty startup death. Prints: tool_calls=<0|1> final_text=<0|1>
        tc = 0
        for m in msgs:
            if m.get("role") == "toolResult":
                tc = 1
            c = m.get("content")
            if isinstance(c, list):
                for b in c:
                    if isinstance(b, dict) and b.get("type") in (
                        "toolCall", "tool_use", "toolResult", "tool_result"
                    ):
                        tc = 1
        ft = 1 if last_assistant_text(msgs) else 0
        print(f"tool_calls={tc} final_text={ft}")

    else:
        print(f"unknown mode: {mode}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
