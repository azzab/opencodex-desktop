# Phase 2 Prompt: Multi-Provider Model Runtime

## Recommended Model

- Primary: `gpt-5.5`
- Reasoning: `high`
- Why: this phase changes provider contracts, model routing, pricing, usage,
  and cache telemetry. Incorrect behavior can waste money or misroute agent
  work.
- Implementation fallback: `gpt-5.4`, reasoning `high`, for narrow UI/test
  patches after the contract is already approved.
- Cheap helper agents: `gpt-5.4-mini`, reasoning `medium`, for read-only
  catalog shape and UI inventory.

## Paste-Ready Goal

```text
/goal Phase 2: Multi-Provider Model Runtime

Run from the OpenCodex Desktop repository root.

Objective:
Keep DeepSeek as the default provider and add OpenRouter as a first-class
provider profile with catalog-backed model selection, pricing-aware automatic
routing, and preserved Kun token economy/cache telemetry.

Model:
Use gpt-5.5 with reasoning high. Use gpt-5.4 high only for narrow follow-up
implementation after the routing/pricing contract is stable.

Read first:
- AGENTS.md and docs/AGENTS.md
- docs/ENGINE_AUDIT_KUN.md
- docs/REFERENCE_INTAKE.md
- docs/PHASE_2_MULTI_PROVIDER_MODEL_RUNTIME_SPEC.md if present
- current provider settings, Kun model profile, auto-router, usage, and
  renderer model-picker code

Scope allowed:
- Provider settings and defaults
- OpenRouter model catalog fetch/parsing
- Model picker UI
- Kun model profiles and auto-router
- Usage/cost calculation and cache telemetry representation
- Focused tests and Phase 2 docs/report

Scope forbidden:
- Do not remove DeepSeek as default.
- Do not store OpenRouter API keys in docs, logs, tests, or catalog snapshots.
- Do not add a second runtime.
- Do not fake cache telemetry when a provider does not expose it.
- Do not push unless explicitly requested.

Required behavior:
1. Add OpenRouter provider profile with base URL https://openrouter.ai/api/v1.
2. Fetch model catalog from https://openrouter.ai/api/v1/models.
3. Store model id, display name, context length, tokenizer assumption,
   capability flags, and normalized pricing.
4. Replace free-text model input with a real model picker.
5. Upgrade auto routing to choose from configured DeepSeek/OpenRouter models by
   task type, context need, cost, tool support, and reasoning need.
6. Extend cost calculation beyond DeepSeek.
7. Preserve DeepSeek cache telemetry and token-economy reporting.

Verification:
- Mock OpenRouter catalog tests.
- Pricing math tests.
- Auto-router tests for cost, context, tools, and reasoning.
- Settings/model picker tests.
- npm test
- npm run typecheck
- npm run build
```

## Exit Criteria

- Users can configure OpenRouter and pick real catalog models.
- `auto` routing has evidence-backed decisions and safe fallbacks.
- Usage reports show cost and cache telemetry accurately, including unknown
  states when providers do not expose cache details.

