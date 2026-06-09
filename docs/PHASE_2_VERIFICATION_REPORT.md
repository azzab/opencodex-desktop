# Phase 2 Multi-Provider Model Runtime Verification

Date: 2026-06-09

## Scope

Phase 2 keeps DeepSeek as the default provider and adds OpenRouter as a first-class catalog-backed provider for Kun. The implementation covers:

- OpenRouter provider defaults and catalog refresh from `https://openrouter.ai/api/v1/models`;
- durable catalog metadata for model id, display name, context length, tokenizer, pricing, and capabilities;
- Settings model picker with provider, context, input-price, reasoning, tools, and recommended-use filters;
- catalog sync into Kun `models.profiles`;
- configured auto-routing across synced DeepSeek/OpenRouter model profiles when a non-DeepSeek catalog model is available;
- generalized USD cost estimation for catalog-priced providers;
- preserved DeepSeek USD/CNY pricing and cache telemetry;
- unknown cache telemetry preservation for providers that do not report cache hit/miss fields;
- catalog fetch error redaction.

## Verification Results

| Command | Result |
| --- | --- |
| `npm test` | PASS: 117 files, 718 tests |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm --prefix kun run typecheck` | PASS |
| `npm --prefix kun test -- src/adapters/model/model-pricing.test.ts src/loop/auto-model-router.test.ts tests/model-client.test.ts tests/usage-service.test.ts` | PASS: 4 files, 45 tests |
| `npm test -- src/shared/app-settings-provider.test.ts src/main/upstream-models.test.ts src/renderer/src/components/settings-section-agents.test.ts` | PASS: 3 files, 15 tests |

## Additional Kun Suite Note

I also ran the full Kun suite with `npm --prefix kun test`. It failed outside the Phase 2 provider/runtime surface and then hung; I stopped that verification process after confirming the failing test in isolation:

```text
npm --prefix kun test -- tests/builtin-tools.test.ts -t "returns a pollable bash session for foreground long-running commands"
FAIL tests/builtin-tools.test.ts
AssertionError: expected '' to contain 'ready'
```

The isolated failure is in the pollable shell-session built-in tool test. It does not touch provider profiles, model catalog refresh, routing, model pricing, cache telemetry, or the Settings model picker.

## Cost Audit

- OpenRouter catalog prices are normalized from per-token strings to USD per million tokens.
- Turn usage uses catalog `input`, `output`, and optional `cacheRead` prices when the active/request model has profile pricing.
- OpenRouter-priced usage reports `costUsd` and leaves `costCny` unset.
- Token economy saved-input estimates use catalog input pricing when available; DeepSeek still uses its native USD/CNY pricing table.
- Cache savings are only estimated when cache telemetry exists and cache-read pricing is available. Unknown cache telemetry stays unknown.

## Secret Audit

- API keys are not copied into catalog model rows or docs.
- Catalog fetch Authorization headers are sent only to the provider request.
- Provider error bodies are redacted before returning to the renderer, including exact configured API key replacement.
