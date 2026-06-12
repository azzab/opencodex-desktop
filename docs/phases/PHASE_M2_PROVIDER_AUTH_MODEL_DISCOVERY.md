# Phase M2: Provider Auth, OAuth, And Model Discovery

## Window And Model
- pi · `deepseek-v4-pro` · `--max` · session `oc-m2-providers` · worktree `../ocx-m2`
- Security-sensitive: credential storage and OAuth flows.

## Goal
Make connecting AI providers as easy as Kilo Code: sign in to OpenRouter with
OAuth (PKCE) or paste any API key, have the app validate it, discover the
models that key can use, and store credentials encrypted. Works for
OpenRouter, DeepSeek, and any OpenAI-compatible endpoint via the existing
endpoint-format support (`chat_completions` | `responses` | `messages`).

## Read First
1. `docs/phases/_OC_HARNESS_FOUNDATION.md`
2. `docs/PHASE_2_MULTI_PROVIDER_MODEL_RUNTIME_SPEC.md` (provider profiles, catalog refresh — already built)
3. `kun/src/contracts/model-endpoint-format.ts` + deepseek-compat client (multi-format support from H0)
4. OpenRouter OAuth PKCE docs (https://openrouter.ai/docs/use-cases/oauth-pkce) and key metadata endpoint (`GET /api/v1/auth/key`)
5. Phase 1 redaction utilities; existing settings under `agents.kun`

## Scope
### Credential storage
- Store provider keys with Electron `safeStorage` (OS keychain-backed
  encryption). Never plaintext in `config.json`, exports, logs, or previews —
  Kun receives keys via its existing env/config injection at process start;
  GUI-managed config sync writes only a `<stored-encrypted>` marker.
- Migration: existing plaintext keys (if any) are migrated to encrypted
  storage on first run and scrubbed from disk.

### OpenRouter OAuth (PKCE)
- "Sign in with OpenRouter" button: open system browser to the PKCE auth URL,
  receive the callback on a loopback-only ephemeral port, exchange the code
  for a key at `/api/v1/auth/keys`, store encrypted. Show key label/limits
  from `GET /api/v1/auth/key`.

### BYOK validation + model discovery
- Paste-a-key flow for OpenRouter / DeepSeek / custom OpenAI-compatible
  providers (base URL + key + endpoint format): on save, validate the key
  (auth-checked models or key-info call), then refresh the model catalog for
  that provider (Phase 2 machinery) and show context length, pricing, and
  capability metadata. Clear error states: invalid key, network, rate-limit.
- Custom provider profiles persist under `agents.kun` and flow through the
  existing model picker and auto-routing.

## Surfaces to Build (REQUIRED)
- Settings → Providers section rework: provider cards (status: connected/
  invalid/unvalidated), OAuth button, key paste with validation, discovered
  model count, re-validate + disconnect actions. All states.
- Main-process credential service (safeStorage) + OAuth callback handler + tests.
- Key-validation/model-discovery service + IPC + tests (mocked HTTP).

## UI rules (BLOCKING)
- i18n en+zh+ar; RTL-safe.
- Keys never appear in renderer state beyond masked previews (`sk-or-…abc4`).
- OAuth callback listener: loopback only, single-use, closed after exchange.
- Redaction pass on every error/log path that could echo a key.

## Out Of Scope
- New provider-specific chat features; billing dashboards; team accounts.
- Anthropic/OpenAI OAuth (no public PKCE-for-key flows; BYOK covers them via compatible endpoints).

## Verification
Full Definition-of-Done gate plus:
```bash
rg -i "sk-or-|sk-ant-|api[_-]?key" src kun --glob '!**/*.test.*' | grep -v redact | head   # no hardcoded/echoed keys
```

## Stop Gates
- safeStorage round-trip test; plaintext migration test (fixture key on disk → encrypted, original scrubbed).
- OAuth flow test with a mocked authorization server (PKCE verifier/challenge correctness, single-use callback).
- Key validation + catalog refresh tests for all three provider types incl. invalid-key state.
- Manual proof: real OpenRouter OAuth sign-in connects and lists models; pasted DeepSeek key validates; both masked in UI; `config.json` contains no key material.

## Git Commit Message
`feat(providers): OAuth sign-in, encrypted key storage, key validation, and per-key model discovery`

## Short Launcher Prompt
Read docs/phases/_OC_HARNESS_FOUNDATION.md and docs/phases/PHASE_M2_PROVIDER_AUTH_MODEL_DISCOVERY.md. Build encrypted credential storage via Electron safeStorage (plaintext migration + scrub), OpenRouter OAuth PKCE sign-in with a single-use loopback callback, BYOK paste flows with key validation and per-key model catalog discovery for OpenRouter/DeepSeek/custom OpenAI-compatible providers (reusing Phase 2 catalog machinery and the endpoint-format contract), and the reworked Providers settings UI with connected/invalid/unvalidated states and masked keys. Keys must never reach config.json, exports, logs, or renderer state unmasked. i18n en+zh+ar, RTL-safe. Run the full gate plus the no-echoed-keys grep; nonzero exits are failures. End with READY_FOR_ORCHESTRATOR_REVIEW listing changed files, security test evidence, tests + results, and gaps.
