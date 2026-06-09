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
    expect(readme).toContain('Phase 10: Codex-Like Parity Target')
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
})
