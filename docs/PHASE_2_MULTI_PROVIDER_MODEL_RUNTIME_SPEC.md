# Phase 2 Multi-Provider Model Runtime Spec

## Goal

Keep DeepSeek as the default Kun provider while adding OpenRouter as a first-class
provider with catalog-backed model selection, pricing-aware automatic routing,
and unchanged cache-first token economy behavior.

## Source-Of-Truth Reads

- `docs/AGENTS.md`: Kun remains the only live agent runtime; settings belong
  under `agents.kun`; no second runtime switcher or diagnostics panel.
- `docs/ENGINE_AUDIT_KUN.md`: provider/model registry work belongs in Kun
  contracts, services, ports/adapters, routes, mapper/UI, and telemetry.
- `docs/REFERENCE_INTAKE.md`: borrowed provider ideas must map into Kun
  contracts and desktop surfaces without secret exposure.
- `/Users/mohamedazab/saas-foundry/CONSTITUTION.md`: service-first, typed
  surfaces, observable behavior, and redacted secrets are non-negotiable.
- `/Users/mohamedazab/saas-foundry/ADOPTION_MATRIX.md`: this is an agentic
  tools product with a UI settings surface, so provider changes must preserve
  service/API/UI boundaries and avoid React-owned business logic.

## Architecture Review

The existing app already has the right extension seam:

- GUI settings contain `provider.providers[]` and `agents.kun.providerId`.
- Electron main resolves selected provider credentials into Kun startup args.
- `syncGuiManagedKunConfig()` writes GUI-managed model profiles into
  `<dataDir>/config.json`.
- Kun loads `models.profiles`, computes context thresholds, reports usage, and
  routes `model: auto` through `kun/src/loop/auto-model-router.ts`.

Phase 2 should therefore extend the current provider profile rather than add a
new runtime path. The OpenRouter catalog is stored as redacted, non-secret
provider metadata in GUI settings, synced into Kun model profiles, and consumed
by Kun for pricing and routing. The renderer only filters and displays catalog
data; it does not own routing or pricing rules.

Rejected alternatives:

- A second OpenRouter runtime process: violates the single-Kun runtime rule and
  would split sessions, approvals, usage, and cache telemetry.
- Free-text model ids with documentation only: fails the model-picker
  requirement and leaves pricing/routing without durable metadata.
- Renderer-only routing: hides business logic in React state and would not apply
  to scheduled, phone, review, or child-agent flows.

## Provider Catalog Contract

Each provider profile stores:

- provider id, display name, API key, base URL, and configured model ids;
- optional catalog refresh timestamp and error message;
- catalog models with model id, name, context length, tokenizer assumption,
  provider id, input/output/cache pricing in USD per million tokens, and
  capability metadata.

OpenRouter is added as a default non-selected provider:

- id: `openrouter`
- base URL: `https://openrouter.ai/api/v1`
- model endpoint: `https://openrouter.ai/api/v1/models`

DeepSeek stays the default selected provider and default model remains
`deepseek-v4-pro`.

## Model Selection UI

The Settings > AI assistant Kun model field becomes a catalog-backed picker:

- provider filter;
- minimum context length filter;
- maximum input price filter;
- reasoning-support filter;
- tool-support filter;
- recommended-use filter;
- model rows showing name, id, context, pricing, and capability badges.

Selecting a model updates both `agents.kun.providerId` and `agents.kun.model`
when the model belongs to a non-active provider. Existing composer model picker
behavior remains compatible with `auto` and provider groups.

## Routing

Kun auto-routing should choose from configured DeepSeek/OpenRouter catalog
models using:

- task type keywords: coding, debugging, review, research, status, chat;
- estimated context need;
- tool support requirement;
- reasoning need;
- estimated input/output cost;
- provider availability through configured provider profiles.

DeepSeek fallback behavior remains intact. If no usable catalog metadata is
available, `auto` continues to choose `deepseek-v4-flash` or `deepseek-v4-pro`
using the existing heuristic/router behavior.

## Pricing And Usage

Pricing generalizes from DeepSeek-only helpers to model-profile pricing:

- DeepSeek keeps native cache-hit/cache-miss pricing and CNY estimates.
- OpenRouter prices are parsed from `/models` per-token fields and normalized to
  USD per million tokens.
- Cache read/write prices are stored when provided.
- Providers without cache telemetry keep `cacheHitRate: null`; the UI must not
  pretend unknown cache data is zero.
- Token economy savings continue to use the same prompt-token delta reporting;
  OpenRouter savings are estimated from uncached input pricing when cache
  telemetry is unavailable.

## Secret Policy

API keys remain in password fields and IPC settings payloads only. Logs, docs,
tests, catalog metadata, model picker rows, config snapshots, and external
model prompts must not include secret values. OpenRouter catalog refresh stores
model metadata only.

## Test Plan

- Mock OpenRouter `/api/v1/models` responses and verify catalog parsing.
- Unit-test pricing math for DeepSeek and OpenRouter.
- Unit-test routing decisions for cost, context, tool support, and reasoning.
- Unit-test settings defaults and normalization for the OpenRouter profile.
- Renderer smoke-test the settings model picker filters and rows.
- Run `npm test`, `npm run typecheck`, and `npm run build`.
