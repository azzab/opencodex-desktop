import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = process.cwd()

describe('OpenCodex Desktop brand documents', () => {
  it('documents the independent product name and non-affiliation notice', () => {
    const notice = readFileSync(join(repoRoot, 'NOTICE.md'), 'utf8')
    expect(notice).toContain('OpenCodex Desktop')
    expect(notice).toContain('not affiliated with OpenAI')
    expect(notice).toContain('DeepSeek GUI')
  })

  it('uses the main README as a detailed OpenCodex Desktop project README', () => {
    const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8')
    expect(readme).toContain('# OpenCodex Desktop')
    expect(readme).toContain('An independent open agent workbench. Not affiliated with OpenAI.')
    expect(readme).toContain('User Agent Stack Import')
    expect(readme).toContain('Phase 10: Parity Hardening, Security, And Release')
    expect(readme).toContain('Arabic')
    expect(readme).toContain('upstream')
  })

  it('includes a detailed landing document for the fork', () => {
    const landing = readFileSync(join(repoRoot, 'LANDING.md'), 'utf8')
    expect(landing).toContain('OpenCodex Desktop')
    expect(landing).toContain('User Agent Stack Import')
    expect(landing).toContain('Phase 10: Codex-Like Parity Target')
    expect(landing).toContain('Arabic')
    expect(landing).toContain('OpenRouter')
    expect(landing).toContain('subagents')
  })

  it('uses OpenCodex Desktop in primary product-facing locale strings', () => {
    const enCommon = readFileSync(join(repoRoot, 'src', 'renderer', 'src', 'locales', 'en', 'common.json'), 'utf8')
    const zhCommon = readFileSync(join(repoRoot, 'src', 'renderer', 'src', 'locales', 'zh', 'common.json'), 'utf8')
    const arCommon = readFileSync(join(repoRoot, 'src', 'renderer', 'src', 'locales', 'ar', 'common.json'), 'utf8')
    const enSettings = readFileSync(join(repoRoot, 'src', 'renderer', 'src', 'locales', 'en', 'settings.json'), 'utf8')
    const zhSettings = readFileSync(join(repoRoot, 'src', 'renderer', 'src', 'locales', 'zh', 'settings.json'), 'utf8')
    const arSettings = readFileSync(join(repoRoot, 'src', 'renderer', 'src', 'locales', 'ar', 'settings.json'), 'utf8')

    for (const content of [enCommon, zhCommon, arCommon, enSettings, zhSettings, arSettings]) {
      expect(content).toContain('OpenCodex Desktop')
    }

    expect(enCommon).toContain('"appName": "OpenCodex Desktop"')
    expect(zhCommon).toContain('"appName": "OpenCodex Desktop"')
    expect(arCommon).toContain('"appName": "OpenCodex Desktop"')
  })

  it('documents the Phase 0.5 Codex-parity reference plan', () => {
    const goal = readFileSync(join(repoRoot, 'docs', 'PHASE_0_5_GOAL.md'), 'utf8')
    const reference = readFileSync(join(repoRoot, 'docs', 'REFERENCE_INTAKE.md'), 'utf8')
    const engine = readFileSync(join(repoRoot, 'docs', 'ENGINE_AUDIT_KUN.md'), 'utf8')
    const desktop = readFileSync(join(repoRoot, 'docs', 'DESKTOP_UX_BENCHMARK.md'), 'utf8')
    const control = readFileSync(join(repoRoot, 'docs', 'BROWSER_COMPUTER_CONTROL_PLAN.md'), 'utf8')

    expect(goal).toContain('Codex-Parity Reference And Engine Plan')
    expect(reference).toContain('Codex is the product compass')
    expect(engine).toContain('Can Kun become the OpenCodex kernel')
    expect(desktop).toContain('The desktop app is the selling point')
    expect(control).toContain('Computer control is also feasible')
  })
})
