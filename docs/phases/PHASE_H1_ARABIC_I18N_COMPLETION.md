# Phase H1: Arabic Localization Completion

## Window And Model
- pi · `deepseek-v4-pro` · reasoning **medium** · session `oc-h1-arabic` · worktree `../ocx-h1`
- Do NOT use `--cheap`: Arabic quality is a product requirement, not a mechanical sweep.

## Goal
Bring Arabic from ~11% to 100% key parity with English across both renderer
namespaces, with native-quality technical Arabic, then flip the
locale-coverage test from "ar fallback allowed" to "ar full parity enforced".
After H1, Arabic is releasable without a "partial beta" label.

## Read First
1. `docs/phases/_OC_HARNESS_FOUNDATION.md`
2. `src/renderer/src/locales/locale-coverage.test.ts`
3. `src/renderer/src/locales/en/common.json` + `settings.json` (source of truth)
4. Existing `ar/common.json` + `ar/settings.json` (match the established register/terminology)

## Scope
### Translation
- Add every missing key: ~1211 in `ar/common.json`, ~441 in `ar/settings.json`.
- Modern Standard Arabic, software register. Keep established product terms
  consistent with existing ar strings (agent, workspace, thread, approval,
  worktree, token, cache, etc.). Keep untranslatable proper nouns
  (OpenCodex, Kun, DeepSeek, OpenRouter, MCP, Git, SSH, URL) in Latin script.
- Preserve every interpolation placeholder (`{{name}}`, `{count}`) exactly;
  never translate placeholder names. Preserve trailing/leading whitespace and
  markdown/HTML fragments inside values.
- Plural/ordinal forms: follow the same suffix scheme the i18n library uses in
  en/zh (`_one`, `_other`, etc.) and supply Arabic plural categories where the
  library supports them.

### Coverage enforcement
**Surface:** `src/renderer/src/locales/locale-coverage.test.ts` — change the
Arabic expectation from fallback-tolerated to **exact key parity** with en for
both namespaces, plus: no empty values, no values identical to the English
string unless whitelisted (proper nouns list in the test).

## Out Of Scope
- New UI components, locale switching logic, RTL CSS work (already done).
- zh changes (already at parity).
- Translating docs/*.md.

## UI rules (BLOCKING)
- JSON must stay valid UTF-8, same key order as en files where practical.
- No machine-translation artifacts: no English sentences pasted as values, no
  transliterated filler.

## Verification
```bash
npm run typecheck && npm run lint && npm test
npm --prefix kun run test
npm run build
git diff --check
node -e "const e=require('./src/renderer/src/locales/en/common.json'),a=require('./src/renderer/src/locales/ar/common.json');const m=Object.keys(e).filter(k=>!(k in a));console.log('missing common:',m.length)"
node -e "const e=require('./src/renderer/src/locales/en/settings.json'),a=require('./src/renderer/src/locales/ar/settings.json');const m=Object.keys(e).filter(k=>!(k in a));console.log('missing settings:',m.length)"
```

## Stop Gates
- Missing-key count = 0 for both namespaces.
- Locale-coverage test now FAILS if a future en key lacks an ar value (prove by temporarily adding a dummy en key, watching it fail, then removing it).
- Spot-check sample (orchestrator): 30 random keys read as natural Arabic; placeholders intact; RTL renders correctly in dev app for Settings + Workbench.

## Git Commit Message
`feat(i18n): complete Arabic translation to full key parity and enforce in coverage test`

## Short Launcher Prompt
Read docs/phases/_OC_HARNESS_FOUNDATION.md and docs/phases/PHASE_H1_ARABIC_I18N_COMPLETION.md. Complete ALL missing Arabic keys in src/renderer/src/locales/ar/common.json and ar/settings.json to exact parity with en, native-quality Modern Standard Arabic, placeholders preserved exactly, then tighten locale-coverage.test.ts to enforce ar parity (no empty values, no English-identical values outside a proper-noun whitelist). Run the full verification block in the phase doc; nonzero exits are failures. Partial translation = FAILED phase. End with READY_FOR_ORCHESTRATOR_REVIEW listing changed files, missing-key counts (must be 0), test results, and gaps.
