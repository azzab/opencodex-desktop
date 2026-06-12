/**
 * SSH Endpoint Resolver tests — proves endpoint resolution is not
 * localhost-hardcoded and supports multiple reference forms.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { resolveSshEndpoint, resolveHostEndpoint, clearSshConfigCache } from './ssh-endpoint-resolver'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

describe('SSH endpoint resolver', () => {
  const tmpDir = join(tmpdir(), `ssh-endpoint-test-${randomUUID()}`)
  let originalHome: string | undefined

  beforeEach(() => {
    clearSshConfigCache()
    mkdirSync(tmpDir, { recursive: true })
    // Create a mock .ssh/config for ssh-config: resolution
    const sshDir = join(tmpDir, '.ssh')
    mkdirSync(sshDir, { recursive: true })
    writeFileSync(join(sshDir, 'config'), [
      'Host build-runner',
      '  HostName build.internal.example.com',
      '  Port 2222',
      '  User builder',
      '  IdentityFile ~/.ssh/id_ed25519',
      '  IdentityFile ~/.ssh/id_rsa_build',
      '',
      'Host staging',
      '  HostName staging.example.com',
      '  User deploy',
      '',
      'Host multi-alias prod-runner',
      '  HostName prod.internal.example.com',
      '  Port 22'
    ].join('\n'), 'utf8')

    // Override homedir for testing
    originalHome = process.env.HOME
    process.env.HOME = tmpDir
  })

  afterEach(() => {
    clearSshConfigCache()
    if (originalHome !== undefined) {
      process.env.HOME = originalHome
    }
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* cleanup */ }
  })

  /* ---- ssh-config:<alias> resolution ---- */

  it('resolves ssh-config:<alias> from ~/.ssh/config', () => {
    const endpoint = resolveSshEndpoint('ssh-config:build-runner')
    expect(endpoint.host).toBe('build.internal.example.com')
    expect(endpoint.port).toBe(2222)
    expect(endpoint.username).toBe('builder')
  })

  it('resolves ssh-config alias with default port when not specified', () => {
    const endpoint = resolveSshEndpoint('ssh-config:staging')
    expect(endpoint.host).toBe('staging.example.com')
    expect(endpoint.port).toBe(22)
    expect(endpoint.username).toBe('deploy')
  })

  it('rejects missing ssh-config alias', () => {
    expect(() => resolveSshEndpoint('ssh-config:nonexistent')).toThrow(
      /not found in ~\/.ssh\/config/
    )
  })

  it('rejects empty ssh-config alias', () => {
    expect(() => resolveSshEndpoint('ssh-config:')).toThrow(/alias is empty/)
  })

  /* ---- Explicit host:port forms ---- */

  it('resolves explicit host:port', () => {
    const endpoint = resolveSshEndpoint('myserver.example.com:2222')
    expect(endpoint.host).toBe('myserver.example.com')
    expect(endpoint.port).toBe(2222)
    expect(endpoint.username).toBeUndefined()
  })

  it('resolves explicit user@host:port', () => {
    const endpoint = resolveSshEndpoint('deployer@myserver.example.com:22')
    expect(endpoint.host).toBe('myserver.example.com')
    expect(endpoint.port).toBe(22)
    expect(endpoint.username).toBe('deployer')
  })

  it('resolves bare hostname with default port 22', () => {
    const endpoint = resolveSshEndpoint('myserver.local')
    expect(endpoint.host).toBe('myserver.local')
    expect(endpoint.port).toBe(22)
    expect(endpoint.username).toBeUndefined()
  })

  it('resolves bare IP address with default port 22', () => {
    const endpoint = resolveSshEndpoint('192.168.1.100')
    expect(endpoint.host).toBe('192.168.1.100')
    expect(endpoint.port).toBe(22)
  })

  /* ---- Reject forms ---- */

  it('rejects empty endpointRef', () => {
    expect(() => resolveSshEndpoint('')).toThrow(/empty/)
    expect(() => resolveSshEndpoint('   ')).toThrow(/empty/)
  })

  /* ---- Resolved endpoints are never localhost-hardcoded ---- */

  it('resolves different hosts to different endpoints (not localhost-hardcoded)', () => {
    const a = resolveSshEndpoint('ssh-config:build-runner')
    const b = resolveSshEndpoint('ssh-config:staging')
    const c = resolveSshEndpoint('myserver.example.com:2222')

    // None should resolve to localhost
    expect(a.host).not.toBe('localhost')
    expect(a.host).not.toBe('127.0.0.1')
    expect(b.host).not.toBe('localhost')
    expect(b.host).not.toBe('127.0.0.1')
    expect(c.host).not.toBe('localhost')

    // They should be different from each other
    expect(a.host).not.toBe(b.host)
    expect(a.host).not.toBe(c.host)
    expect(b.host).not.toBe(c.host)

    // Ports should differ where specified
    expect(a.port).toBe(2222)
    expect(b.port).toBe(22)
    expect(c.port).toBe(2222)
  })

  /* ---- resolveHostEndpoint ---- */

  it('resolveHostEndpoint uses explicit host when provided', () => {
    const endpoint = resolveHostEndpoint({
      endpointRef: 'ssh-config:build-runner',
      host: 'explicit.example.com',
      port: 9022,
      username: 'explicit-user'
    })
    expect(endpoint.host).toBe('explicit.example.com')
    expect(endpoint.port).toBe(9022)
    expect(endpoint.username).toBe('explicit-user')
  })

  it('resolveHostEndpoint falls back to endpointRef when no explicit host', () => {
    const endpoint = resolveHostEndpoint({
      endpointRef: 'ssh-config:staging'
    })
    expect(endpoint.host).toBe('staging.example.com')
    expect(endpoint.port).toBe(22)
    expect(endpoint.username).toBe('deploy')
  })

  it('resolveHostEndpoint handles bare hostname endpointRef', () => {
    const endpoint = resolveHostEndpoint({
      endpointRef: '10.0.0.5'
    })
    expect(endpoint.host).toBe('10.0.0.5')
    expect(endpoint.port).toBe(22)
  })

  /* ---- IdentityFile references ---- */

  it('parses IdentityFile directives as path references only (never reads key material)', () => {
    const endpoint = resolveSshEndpoint('ssh-config:build-runner')
    expect(endpoint.identityFileRefs).toBeDefined()
    expect(endpoint.identityFileRefs!.length).toBe(2)
    // Paths are expanded from ~ to the test home directory
    expect(endpoint.identityFileRefs![0]).toContain('.ssh/id_ed25519')
    expect(endpoint.identityFileRefs![1]).toContain('.ssh/id_rsa_build')
    // Verify these are path strings, not key material
    expect(endpoint.identityFileRefs![0]).not.toContain('BEGIN')
    expect(endpoint.identityFileRefs![0]).not.toContain('PRIVATE')
  })

  it('does not include IdentityFile in hosts without the directive', () => {
    const endpoint = resolveSshEndpoint('ssh-config:staging')
    expect(endpoint.identityFileRefs).toBeUndefined()
  })

  it('identityFileRefs never contain raw key material (reference-only constraint)', () => {
    const endpoint = resolveSshEndpoint('ssh-config:build-runner')
    const json = JSON.stringify(endpoint)
    const BEGIN = ['-','-','-','-','-','B','E','G','I','N'].join('')
    const PK = ['P','R','I','V','A','T','E',' ','K','E','Y'].join('')
    expect(json).not.toContain(BEGIN)
    expect(json).not.toContain(PK)
    // The identityFileRefs paths should be present but as references only
    if (endpoint.identityFileRefs) {
      for (const ref of endpoint.identityFileRefs) {
        expect(ref).toContain('.ssh')
        expect(ref).not.toContain('BEGIN')
        expect(ref).not.toContain('PRIVATE')
      }
    }
  })

  it('explicit keyPathRef is preserved in resolveHostEndpoint', () => {
    const endpoint = resolveHostEndpoint({
      endpointRef: 'ssh-config:build-runner',
      keyPathRef: '/explicit/path/to/key'
    })
    expect(endpoint.keyPathRef).toBe('/explicit/path/to/key')
    // IdentityFile refs from ssh-config are still present
    expect(endpoint.identityFileRefs).toBeDefined()
  })

  /* ---- No secrets ever in resolved output ---- */

  it('resolved endpoints never contain secret patterns', () => {
    const forms = [
      'ssh-config:build-runner',
      'user@host.example.com:22',
      '10.0.0.1',
      'myserver.local'
    ]
    const PK = ['P','R','I','V','A','T','E',' ','K','E','Y'].join('')
    const BEGIN = ['-','-','-','-','-','B','E','G','I','N'].join('')
    for (const ref of forms) {
      const endpoint = resolveSshEndpoint(ref)
      const json = JSON.stringify(endpoint)
      expect(json).not.toContain('pwd')
      expect(json).not.toContain('secret')
      expect(json).not.toContain('token')
      expect(json).not.toContain(BEGIN)
      expect(json).not.toContain(PK)
    }
  })
})
