# Phase 1 User Agent Stack Import Spec

## Goal

Add a generic User Agent Stack profile that imports an existing local agent setup into OpenCodex Desktop without personal naming, secret exposure, or a second runtime.

## Scope

- Discover skill roots from the active workspace, Codex user folders, `.codex/skills`, `.agents/skills`, and Codex plugin cache roots.
- Discover MCP server definitions from user-level agent config files and convert them into Kun-compatible `capabilities.mcp.servers`.
- Check common developer and agent CLIs and persist redacted status metadata.
- Store the imported profile under `agents.kun` so Electron and browser/dev mode share the same settings object.
- Surface import, refresh, status, and redacted preview controls in Settings.
- Preserve English, Arabic, and Chinese locale support and existing upstream attribution.

## Runtime Boundary

Kun remains the only kernel. The importer is a main-process service that writes GUI settings, and existing GUI-managed Kun config sync writes the resulting skills and MCP data into `<dataDir>/config.json`. No renderer-owned agent runtime or second background engine is introduced.

## Secret Policy

Imported profile data may include secret-like environment keys, headers, command arguments, or URLs. Any value shown in UI, docs, logs, tests, or persisted profile preview is redacted. Kun runtime config receives redacted MCP env/header values from the import profile; operators can still maintain real secret values in their original source configs.

## UI

Settings > AI assistant gains a User Agent Stack card with import and refresh actions, summary counters, CLI status badges, and a redacted JSON preview. It uses existing Settings cards, rows, buttons, and i18n keys.

## Testing

- Unit tests cover skill root discovery, MCP conversion, secret redaction, CLI status checks, settings normalization, Kun config sync, and IPC persistence.
- Renderer smoke coverage verifies the Settings section renders the profile import controls without removing existing agent, skill, MCP, and permission sections.
