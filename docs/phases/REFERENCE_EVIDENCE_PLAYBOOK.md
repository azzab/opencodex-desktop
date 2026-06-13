# Reference Evidence Playbook

How the orchestrator gathers **visual + behavioral evidence** from reference
apps BEFORE dispatching any phase that clones competitor UX. Prose feature
lists produce shallow clones (proven by the M3 v0.1.0 extension feedback);
screenshots + behavior notes produce parity.

## When evidence is mandatory

Any phase whose goal includes "like X" or "parity with X". Currently: M2.5
(provider experience), M3 (IDE extension), M4b (mobile), and future UX
phases. The orchestrator builds the evidence pack FIRST, commits it, and
lists the pack paths in the worker's launcher prompt. A dispatch without its
evidence pack is a process violation.

## How to gather (in priority order)

1. **Live local apps (computer access).** Install and drive the real thing,
   screenshot each surface. Available on this machine: VS Code (install
   Cline, Kilo Code, Roo Code, Continue from the marketplace — all free),
   Cursor, Antigravity. For each feature: screenshot the surface, then note
   the interaction flow (what happens on click, streaming behavior, error
   states).
2. **Official docs + GitHub.** Docs sites and repo READMEs/docs/assets carry
   curated screenshots and feature explanations (cline/cline, Kilo-Org/
   kilocode, RooCodeInc/Roo-Code, continuedev/continue, openai/codex,
   google-gemini/gemini-cli, Aider, OpenCode). Save the images and the
   source URLs.
3. **Web search** for review articles / comparison posts / video stills when
   1–2 leave gaps.

## Output format (committed to the repo)

```
docs/reference-evidence/<area>/
  EVIDENCE.md
  <app>--<feature>--NN.png
```

`EVIDENCE.md` structure:

| Feature | Reference app | Behavior notes (flow, states, edge cases) | Screenshot | Source | Priority |
|---|---|---|---|---|---|
| Provider connect flow | Kilo Code | Settings → API Provider dropdown (25+ providers) → per-provider fields → "Test connection"… | kilocode--providers--01.png | URL or "live app 2026-06-13" | P1 |

- **Priority P1** = must exist in our implementation or be a documented gap
  in the worker's report. P2 = nice-to-have. P3 = noted, out of scope.
- End with a "What we will NOT copy" section (branding, proprietary assets,
  exact copy text).

## Rules (BLOCKING)

- Evidence is for internal benchmarking only. Never ship copied assets,
  icons, marketing copy, or prompt text — re-implement behavior in OpenCodex
  design language with our i18n (en+zh+ar, RTL).
- Cite every source. No paid-account logins for evidence gathering. Redact
  any personal data (emails, keys, repo names) visible in screenshots before
  committing.
- Workers receive evidence paths in their launcher prompt and must map every
  P1 row to an implemented surface or a documented gap in
  READY_FOR_ORCHESTRATOR_REVIEW.

## Standing evidence areas

| Area | Dir | Feeds phase | Reference apps |
|---|---|---|---|
| Provider/API experience | `docs/reference-evidence/providers/` | M2.5 | Kilo Code, Cline, Roo Code, Continue |
| IDE extension UX | `docs/reference-evidence/ide/` | M3 | Cline, Kilo Code, Copilot Chat, Codex IDE ext, Continue |
| Mobile control surfaces | `docs/reference-evidence/mobile/` | M4b | Codex (ChatGPT mobile tasks), Happy Coder, terminal-control apps |
| Workbench/desktop UX | `docs/reference-evidence/workbench/` | future | Claude Code desktop, Antigravity, Cursor |
