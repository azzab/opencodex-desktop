import { describe, expect, it } from 'vitest'
import { resolveAuthConfig, isLoopbackHost, baseUrlFromAuth } from '../src/auth.js'

describe('resolveAuthConfig', () => {
  it('uses defaults when no env vars', () => {
    const auth = resolveAuthConfig({})
    expect(auth.host).toBe('127.0.0.1')
    expect(auth.port).toBe(18999)
    expect(auth.token).toBe('')
    expect(auth.requireToken).toBe(false)
    expect(auth.loopbackOnly).toBe(true)
  })

  it('reads token from env', () => {
    const auth = resolveAuthConfig({ OPENCODEX_TOKEN: 'secret' })
    expect(auth.token).toBe('secret')
    expect(auth.requireToken).toBe(true)
  })

  it('reads host and port from env', () => {
    const auth = resolveAuthConfig({ OPENCODEX_HOST: 'localhost', OPENCODEX_PORT: '12345' })
    expect(auth.host).toBe('localhost')
    expect(auth.port).toBe(12345)
  })

  it('falls back to KUN env vars', () => {
    const auth = resolveAuthConfig({ KUN_RUNTIME_TOKEN: 'kun-secret', KUN_PORT: '19999' })
    expect(auth.token).toBe('kun-secret')
    expect(auth.port).toBe(19999)
  })

  it('OPENCODEX_TOKEN takes priority', () => {
    const auth = resolveAuthConfig({ OPENCODEX_TOKEN: 'main', KUN_RUNTIME_TOKEN: 'fallback' })
    expect(auth.token).toBe('main')
  })
})

describe('isLoopbackHost', () => {
  it('accepts localhost', () => {
    expect(isLoopbackHost('localhost')).toBe(true)
  })

  it('accepts 127.0.0.1', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true)
  })

  it('accepts ::1', () => {
    expect(isLoopbackHost('::1')).toBe(true)
  })

  it('rejects external hosts', () => {
    expect(isLoopbackHost('example.com')).toBe(false)
    expect(isLoopbackHost('192.168.1.1')).toBe(false)
  })
})

describe('baseUrlFromAuth', () => {
  it('builds http URL', () => {
    expect(baseUrlFromAuth({ token: '', host: '127.0.0.1', port: 18999, requireToken: false, loopbackOnly: true }))
      .toBe('http://127.0.0.1:18999')
  })
})
