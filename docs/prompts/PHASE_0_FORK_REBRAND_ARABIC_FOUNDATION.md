# Phase 0 Prompt: Fork, Rebrand, Arabic Foundation

## Recommended Model

- Primary: `gpt-5.4`
- Reasoning: `high`
- Why: this phase touches branding, package metadata, README/notice wording,
  i18n, and repository hygiene. It needs careful repo edits but not the deepest
  kernel reasoning.
- Optional review: `gpt-5.5`, reasoning `high`, if attribution or license text
  changes.

## Paste-Ready Goal

```text
/goal Phase 0: Fork, Rebrand, Arabic Foundation

Run from the OpenCodex Desktop repository root.

Objective:
Prepare the DeepSeek GUI fork as OpenCodex Desktop, an independent open agent
workbench. Keep upstream attribution, keep the upstream sync path, preserve
English and Chinese support, add Arabic as a first-class UI/documentation
requirement, and make the repository safe to continue from a clean OpenCodex
identity.

Model:
Use gpt-5.4 with reasoning high. Use gpt-5.5 high only for legal/attribution
review if needed.

Read first:
- AGENTS.md if present
- README.md
- LANDING.md if present
- NOTICE.md if present
- package.json and package-lock.json
- docs/AGENTS.md
- locale files under src/renderer/src/locales

Scope allowed:
- README, LANDING, NOTICE, package metadata, product identity helpers,
  i18n locale files, basic branding tests, and docs needed for the fork
  foundation.

Scope forbidden:
- Do not remove Chinese language files.
- Do not remove DeepSeek GUI attribution.
- Do not add OpenAI affiliation language.
- Do not add personal branding.
- Do not add or remove runtime engines.
- Do not push unless explicitly requested.

Deliverables:
1. Product name: OpenCodex Desktop.
2. Tagline: "An independent open agent workbench. Not affiliated with OpenAI."
3. Clear attribution to DeepSeek GUI by XingYu-Zhong and contributors.
4. Mark ownership and non-affiliation notice for OpenAI, Codex, DeepSeek, and
   other referenced marks.
5. Arabic locale foundation and RTL handling where applicable.
6. Package metadata aligned with the new project identity.
7. Tests or snapshots proving branding strings and locale wiring.

Required loop:
1. Run git status and identify unrelated dirty/untracked files.
2. Read current docs and branding helpers before editing.
3. Make the smallest identity/i18n edits needed.
4. Run focused branding/i18n tests.
5. Run npm test, npm run typecheck, and npm run build unless a documented
   environment blocker prevents it.
6. Report changed files, verification, and any remaining upstream-sync risks.
```

## Exit Criteria

- Public docs describe OpenCodex Desktop as independent.
- README and notice text preserve original upstream attribution.
- Arabic support is present without deleting Chinese support.
- The repo can continue with Phase 0.5 or Phase 1 from a coherent product
  identity.

