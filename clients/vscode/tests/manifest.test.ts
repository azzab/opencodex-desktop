import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(root, relativePath), 'utf8')) as T
}

describe('extension manifest identity', () => {
  it('uses a valid publisher.name identifier in workspace recommendations', () => {
    const pkg = readJson<{ publisher?: string; name: string; type?: string }>('package.json')
    const recommendations = readJson<{ recommendations: string[] }>('.vscode/extensions.json')
      .recommendations

    expect(pkg.publisher).toMatch(/^[a-z0-9][a-z0-9-]*$/)
    expect(pkg.name).toMatch(/^[a-z0-9][a-z0-9-]*$/)
    expect(pkg.type).toBe('module')
    expect(recommendations).toContain(`${pkg.publisher}.${pkg.name}`)
    expect(recommendations).not.toContain(`undefined_publisher.${pkg.name}`)
  })
})
