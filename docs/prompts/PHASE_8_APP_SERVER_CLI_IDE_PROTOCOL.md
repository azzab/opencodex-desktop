# Phase 8 Prompt: App Server, CLI Bridge, And IDE Bridge

## Recommended Model

- Primary: `gpt-5.5`
- Reasoning: `extra high`
- Why: this phase defines the protocol that lets Electron, CLI, IDE, mobile,
  and browser clients share the same kernel without fragmenting sessions or
  approvals.
- Implementation helper: `gpt-5.4`, reasoning `high`, for narrow client
  adapters after the protocol is stable.

## Paste-Ready Goal

```text
/goal Phase 8: App Server, CLI Bridge, and IDE Bridge

Run from the OpenCodex Desktop repository root.

Objective:
Create an internal OpenCodex app-server protocol so Electron, CLI, IDE,
browser, and mobile surfaces can start/resume/fork threads, stream turns,
steer active work, attach artifacts, inspect approvals, and share project
state through the same Kun kernel.

Model:
Use gpt-5.5 with reasoning extra high.

Read first:
- AGENTS.md and docs/AGENTS.md
- docs/ENGINE_AUDIT_KUN.md
- docs/DESKTOP_UX_BENCHMARK.md
- docs/REFERENCE_INTAKE.md
- current Kun HTTP/SSE routes, Electron IPC/preload, runtime events,
  thread/session store, fork/resume, and settings code

Scope allowed:
- App-server protocol docs and schemas
- Thread/start/resume/fork/turn/steer endpoints or adapters
- Streamed notification model
- Local auth/token model for loopback clients
- CLI bridge prototype
- IDE bridge protocol stub
- Tests and Phase 8 docs/report

Scope forbidden:
- Do not expose websocket or app server on public interfaces without auth.
- Do not create separate session stores per client.
- Do not bypass Kun approvals or usage tracking.
- Do not expose secrets through notifications.
- Do not push unless explicitly requested.

Required behavior:
1. Define protocol objects for project, thread, turn, item, tool call,
   approval, artifact, usage, goal, loop, subagent, and automation events.
2. Support thread start, resume, fork, and turn steering.
3. Support streamed notifications with opt-out categories.
4. Add local auth for loopback clients.
5. Add CLI bridge commands for health, projects, threads, start, resume, and
   steer.
6. Add IDE bridge contract or stub that can sync open files/context later.
7. Document compatibility with Electron, mobile, remote relay, and future IDE
   extensions.

Verification:
- Protocol schema tests.
- App-server route/adapter tests.
- CLI bridge smoke tests.
- Auth/loopback safety tests.
- npm test
- npm run typecheck
- npm run build
```

## Exit Criteria

- OpenCodex has one shared protocol for desktop, CLI, IDE, browser, and mobile
  surfaces.
- Sessions, approvals, usage, and events remain owned by Kun.
- External clients can be added without creating a parallel product.

