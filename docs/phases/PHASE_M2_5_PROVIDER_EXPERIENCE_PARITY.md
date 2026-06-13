# Phase M2.5: Provider Experience Parity (Kilo Code / Cline Class)

## Window And Model
- pi · `deepseek-v4-pro` · `--max` · session `oc-m2-5-provider-ux` · worktree `../ocx-m2-5`
- **Evidence-gated:** orchestrator must commit `docs/reference-evidence/providers/` (per REFERENCE_EVIDENCE_PLAYBOOK.md) BEFORE dispatch and list the paths in the launcher prompt.

## Goal
M2 built the plumbing (OAuth, safeStorage, validation, discovery). Operator
feedback: "our API integration is nowhere near Kilo Code / Hermes class."
This phase closes the experience gap: provider breadth, per-task model
assignment, model capability cards, and a connect flow that feels as
polished as the best VS Code agent extensions — measured against committed
screenshots, not prose.

## Read First
1. `docs/phases/_OC_HARNESS_FOUNDATION.md` + `REFERENCE_EVIDENCE_PLAYBOOK.md`
2. `docs/reference-evidence/providers/EVIDENCE.md` (the parity target — every P1 row)
3. M2 credential service, validation/discovery services, Providers settings UI (reuse, don't fork)
4. `docs/PHASE_2_MULTI_PROVIDER_MODEL_RUNTIME_SPEC.md` (routing, pricing, catalog)

## Scope
### Provider breadth (all through M2's credential service + endpoint-format contract)
- First-class profiles with validation + model discovery: **Anthropic,
  OpenAI, Google Gemini, xAI/Grok, Mistral, Groq, Together, Fireworks**
  (OpenAI-compatible where applicable), plus **local: Ollama and LM Studio**
  (auto-detect on default ports, no key needed) — alongside existing
  DeepSeek + OpenRouter + custom endpoints.
- Per-provider capability mapping into the existing catalog: context length,
  tool support, vision, pricing where published; "unknown" shown honestly.

### Experience (match P1 evidence rows)
- Provider picker with searchable list + logos-free identification (text/
  initial badges — no copied brand assets), connect status, "Test
  connection" action with latency result, last-validated timestamp.
- Model picker upgrades: capability badges (tools/vision/context), price per
  1M in/out, free-model filter (OpenRouter `:free` models), favorites.
- **Per-task model assignment** (Kilo/Cline "modes" pattern): map
  plan/code/review/cheap-subagent roles to models, integrated with the
  existing auto-routing and Phase 3 child-model setting.
- Quick-switch model control in the composer (current model visible, click
  to change, per-thread override).
- First-run: "Connect a provider" empty-state flow that gets a new user from
  zero to a working model in under a minute (OAuth path or key paste).

## Surfaces to Build (REQUIRED)
- Reworked Providers settings (cards grid, search, status, test-connection) — all states.
- Per-task model assignment settings + composer quick-switch.
- Ollama/LM Studio auto-detection service + tests.
- Provider profile definitions + validation/discovery adapters + tests per provider type (mocked HTTP).

## UI rules (BLOCKING)
- Keys ONLY via M2 credential service (safeStorage); masked everywhere; no key material in config.json/exports/logs.
- i18n en+zh+ar; RTL-safe; Intl number/price formatting.
- Every P1 evidence row → implemented surface or documented gap. No silent skips.

## Out Of Scope
- AWS Bedrock / GCP Vertex enterprise auth (documented gap); team/org accounts; usage-based billing dashboards.

## Verification
Full Definition-of-Done gate plus the M2 no-echoed-keys grep and a P1-coverage table in the report.

## Stop Gates
- P1 coverage table complete (implemented vs documented-gap, zero unexplained).
- Manual proof: connect ≥3 real providers (operator supplies keys at review time), test-connection works, per-task assignment routes a real turn to the assigned model (visible in usage pane).
- Ollama auto-detect proof with a local model (or documented absence if none installed).
- Fresh-user flow: from empty config to first successful turn in under a minute, screen-recorded or step-logged.

## Git Commit Message
`feat(providers): provider breadth, per-task model assignment, and connect-flow parity with reference agents`

## Short Launcher Prompt
Read docs/phases/_OC_HARNESS_FOUNDATION.md, docs/phases/PHASE_M2_5_PROVIDER_EXPERIENCE_PARITY.md, and every file in docs/reference-evidence/providers/. Build provider experience parity: first-class validated profiles for Anthropic, OpenAI, Gemini, xAI, Mistral, Groq, Together, Fireworks plus Ollama/LM Studio auto-detect, all through the existing M2 credential service and endpoint-format contract; reworked provider cards UI with test-connection; model picker with capability badges, pricing, free filter, favorites; per-task model assignment wired into auto-routing; composer quick-switch; first-run connect flow. Map EVERY P1 evidence row to a surface or documented gap. Keys never leave safeStorage; i18n en+zh+ar RTL-safe. Run the full gate + no-echoed-keys grep; nonzero exits are failures. End with READY_FOR_ORCHESTRATOR_REVIEW with the P1 coverage table, changed files, tests + results, and gaps.
