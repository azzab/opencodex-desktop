import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  convertUserAgentStackMcpServers,
  discoverUserAgentStackProfile,
  redactUserAgentStackValue
} from './user-agent-stack-service'

describe('user-agent-stack-service', () => {
  let tempRoot = ''
  let homeDir = ''
  let workspaceRoot = ''

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'user-agent-stack-'))
    homeDir = join(tempRoot, 'home')
    workspaceRoot = join(tempRoot, 'workspace')
    await mkdir(homeDir, { recursive: true })
    await mkdir(workspaceRoot, { recursive: true })
  })

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true })
  })

  it('discovers workspace, Codex user, Agents user, and plugin cache skill roots', async () => {
    await writeSkill(join(workspaceRoot, '.codex', 'skills', 'project-codex'), 'project-codex')
    await writeSkill(join(workspaceRoot, '.agents', 'skills', 'project-agent'), 'project-agent')
    await writeSkill(join(homeDir, '.codex', 'skills', 'codex-user'), 'codex-user')
    await writeSkill(join(homeDir, '.agents', 'skills', 'agent-user'), 'agent-user')
    await writeSkill(join(homeDir, '.codex', 'plugins', 'cache', 'plugin-a', '1.0.0', 'skills', 'plugin-skill'), 'plugin-skill')

    const profile = await discoverUserAgentStackProfile({
      homeDir,
      workspaceRoot,
      cliNames: [],
      execFile: vi.fn()
    })

    expect(profile.skillRoots.map((root) => root.path)).toEqual(expect.arrayContaining([
      join(workspaceRoot, '.codex', 'skills'),
      join(workspaceRoot, '.agents', 'skills'),
      join(homeDir, '.codex', 'skills'),
      join(homeDir, '.agents', 'skills'),
      join(homeDir, '.codex', 'plugins', 'cache', 'plugin-a', '1.0.0', 'skills')
    ]))
  })

  it('converts Codex config MCP servers into redacted Kun-compatible servers', () => {
    const converted = convertUserAgentStackMcpServers({
      mcpServers: {
        github: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github', '--token', 'token_fixture_value'],
          env: {
            GITHUB_TOKEN: 'token_fixture_value'
          }
        },
        docs: {
          url: 'https://mcp.example.test/mcp',
          headers: {
            Authorization: 'Bearer live-token'
          }
        }
      }
    }, '/tmp/codex-config.json')

    expect(converted).toEqual([
      expect.objectContaining({
        id: 'github',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github', '--token', '<redacted>'],
        env: { GITHUB_TOKEN: '<redacted>' },
        trustScope: 'user',
        sourcePath: '/tmp/codex-config.json'
      }),
      expect.objectContaining({
        id: 'docs',
        transport: 'streamable-http',
        url: 'https://mcp.example.test/mcp',
        headers: { Authorization: '<redacted>' }
      })
    ])
  })

  it('redacts secret-like strings before building previews', () => {
    expect(redactUserAgentStackValue({
      safe: 'visible',
      args: ['--api-key', 'pk-fixture-live-sentinel', '--model', 'fast'],
      nested: {
        url: 'https://example.test?token=fixture-value',
        password: 'plain-fixture'
      }
    })).toEqual({
      safe: 'visible',
      args: ['--api-key', '<redacted>', '--model', 'fast'],
      nested: {
        url: 'https://example.test?token=<redacted>',
        password: '<redacted>'
      }
    })
  })

  it('checks CLI availability without failing the import when a command is missing', async () => {
    const execFile = vi.fn(async (command: string) => {
      if (command === 'git') return { stdout: 'git version 2.50.0\n', stderr: '' }
      throw Object.assign(new Error('not found'), { code: 'ENOENT' })
    })

    const profile = await discoverUserAgentStackProfile({
      homeDir,
      workspaceRoot,
      cliNames: ['git', 'hcloud'],
      execFile
    })

    expect(profile.cli).toEqual([
      expect.objectContaining({ name: 'git', available: true, version: 'git version 2.50.0' }),
      expect.objectContaining({ name: 'hcloud', available: false })
    ])
  })

  async function writeSkill(root: string, name: string): Promise<void> {
    await mkdir(root, { recursive: true })
    await writeFile(join(root, 'SKILL.md'), `---\nname: ${name}\n---\n`, 'utf8')
  }
})
