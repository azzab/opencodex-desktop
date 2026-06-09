# Phase 1 User Agent Stack Import Verification Report

Date: 2026-06-09

## Scope

Phase 1 adds a generic User Agent Stack import profile for existing local agent
setups. The implementation imports local skill roots, redacted MCP server
definitions, and common CLI availability into the OpenCodex/Kun settings path
without adding a second runtime or personal branding.

## Requirement Evidence

| Requirement | Evidence |
| --- | --- |
| Discover workspace and user skill roots | `src/main/services/user-agent-stack-service.ts` discovers workspace `.codex/skills`, workspace `.agents/skills`, user `~/.codex/skills`, user `~/.agents/skills`, and Codex plugin cache skill roots. |
| Convert Codex/user MCP definitions | `src/main/services/user-agent-stack-service.ts` reads JSON and simple TOML-like MCP config shapes and converts server entries into `UserAgentStackMcpServerV1` records. |
| Redact secret-like values | `redactUserAgentStackValue` redacts secret keys, URLs with token/password query parameters, authorization headers, and command arguments following secret-like flags. |
| Check CLI availability | `checkUserAgentStackCli` probes configured CLI names and records path/version/error status without requiring the CLI to exist. |
| Persist under `agents.kun` | `src/shared/app-settings-kun.ts` defines and normalizes `agents.kun.userAgentStack`; `src/main/ipc/register-app-ipc-handlers.ts` writes imported profiles through the settings store. |
| Sync into Kun config | `src/main/kun-process.ts` merges imported skill roots and redacted MCP server definitions into GUI-managed Kun config before runtime startup. |
| Settings UI | `src/renderer/src/components/settings-section-agents.tsx` renders User Agent Stack import, refresh, counters, CLI status, and redacted preview controls. |
| Tests | `src/main/services/user-agent-stack-service.test.ts`, `src/main/settings-store.test.ts`, `src/main/ipc/register-app-ipc-handlers.test.ts`, `src/main/kun-process.test.ts`, and `src/renderer/src/components/settings-section-agents.test.ts` cover the service, settings, IPC, config sync, and UI surfaces. |

## Secret Audit

- Imported profile previews use `<redacted>` for secret-like values.
- Tests verify token-bearing command arguments, environment variables, headers,
  URL query parameters, and password-like fields are redacted.
- The importer does not mutate original Codex, `.agents`, MCP, or shell config
  source files.
- Operators still keep real MCP secret values in their source configs; the GUI
  import profile stores redacted server definitions.

## Current Limits

- This report proves source and test coverage in the local tree, not a
  real-world import from every possible Codex, Claude Code, OpenCode, or MCP
  config variant.
- The imported Kun MCP server definitions are intentionally redacted, so the
  imported profile is display/export-safe rather than a secret-bearing runtime
  credential store.
- Phase 1 does not implement a full skill/plugin marketplace; it imports and
  exposes local stack metadata for the existing Kun settings path.

## Fresh S0 Verification Results

Fresh command results from the S0 stabilization pass:

| Command | Result |
| --- | --- |
| `npm test -- src/main/product-brand.test.ts src/main/services/user-agent-stack-service.test.ts src/main/kun-process.test.ts src/shared/app-settings.test.ts src/renderer/src/components/settings-section-agents.test.ts` | PASS: 5 files, 79 tests |
| `npm test` | PASS: 117 files, 728 tests |
| `npm run typecheck` | PASS |
| `npm --prefix kun run typecheck` | PASS |
| `npm --prefix kun test` | PASS: 45 files, 447 tests |
| `npm run build` | PASS |

S0 note: the root test suite initially exposed stale branding expectations in
tests after the OpenCodex locale cleanup. Those assertions were updated and the
full root suite was rerun successfully.
