import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { APP_PRODUCT_NAME } from './app-identity'

type ProductMeta = {
  productName: string
  repository?: { url?: string; type?: string }
}

describe('OpenCodex Desktop brand contract', () => {
  const root = resolve(__dirname, '../..')

  const readText = (relative: string): string => readFileSync(resolve(root, relative), 'utf8')
  const readPackage = (): ProductMeta => JSON.parse(readText('package.json')) as ProductMeta

  it('uses OpenCodex Desktop as app identity', () => {
    expect(APP_PRODUCT_NAME).toBe('OpenCodex Desktop')
  })

  it('keeps package metadata aligned with OpenCodex Desktop fork', () => {
    const pkg = readPackage()
    expect(pkg.productName).toBe('OpenCodex Desktop')
    expect(pkg.repository?.url).toBe('https://github.com/azzab/opencodex-desktop.git')
  })

  it('ensures public docs state non-affiliation and include fork provenance', () => {
    const readmeZh = readText('README.md')
    const readmeEn = readText('README.en.md')
    const landing = readText('LANDING')
    const notice = readText('NOTICE')

    expect(readmeZh).toContain('OpenCodex Desktop')
    expect(readmeEn).toContain('OpenCodex Desktop')
    expect(readmeZh).toContain('本项目与 DeepSeek Inc. 无隶属关系')
    expect(readmeEn).toContain('This project is not affiliated with DeepSeek Inc.')
    expect(landing).toContain('OpenCodex Desktop')
    expect(notice).toContain('OpenCodex Desktop is independently operated and maintained.')
  })

  it('does not include personal fork attribution in public docs', () => {
    const readmeZh = readText('README.md')
    const readmeEn = readText('README.en.md')

    expect(readmeZh).not.toMatch(/XingYu-Zhong/)
    expect(readmeEn).not.toMatch(/XingYu-Zhong/)
  })
})
