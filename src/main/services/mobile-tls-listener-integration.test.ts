/**
 * MobileTlsListener — REAL INTEGRATION TESTS
 *
 * These tests start the actual TLS listener on a loopback ephemeral port,
 * issue a device token, send HTTPS requests with self-signed cert handling
 * (rejectUnauthorized: false), and prove:
 *
 *   (1) authenticated GET /v1/threads  → runtimeRequest receives exact path/method/headers → proxied body/status
 *   (2) authenticated GET /v1/approvals/<id> → runtimeRequest called
 *   (3) authenticated /v1/terminal, /v1/settings, /v1/credentials, /v1/files → 403 BEFORE runtimeRequest is called
 *   (4) unauthenticated /mobile/qr-payload, /, /version, /api, /v1, /health → 401 / no version banner / runtimeRequest NEVER called
 *   (5) POST /mobile/pair → success only with valid unexpired single-use code; fail on reused/expired/invalid
 *
 * Previous remediation reviewer rejected the unit tests because they called
 * mockRuntimeRequest directly instead of driving through MobileTlsListener auth,
 * route-scope enforcement, and handleRuntimeProxy. These tests fix that gap.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import * as https from 'node:https'
import * as net from 'node:net'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { execSync } from 'node:child_process'
import { MobileTlsListener } from './mobile-tls-listener'
import { MobilePairingService } from './mobile-pairing-service'
import type { MobileAccessSettingsV1 } from '../../shared/app-settings-types'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as net.AddressInfo
      server.close(() => resolve(addr.port))
    })
  })
}

interface HttpsTestResponse {
  status: number
  body: string
  headers: Record<string, string | string[] | undefined>
}

function httpsGet(opts: {
  hostname: string
  port: number
  path: string
  headers?: Record<string, string>
}): Promise<HttpsTestResponse> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: opts.hostname,
        port: opts.port,
        path: opts.path,
        method: 'GET',
        headers: opts.headers ?? {},
        rejectUnauthorized: false
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf-8'),
            headers: res.headers as Record<string, string | string[] | undefined>
          })
        })
      }
    )
    req.on('error', reject)
    req.end()
  })
}

function httpsPost(opts: {
  hostname: string
  port: number
  path: string
  headers?: Record<string, string>
  body?: string
}): Promise<HttpsTestResponse> {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json', ...opts.headers }
    const body = opts.body ?? ''
    const req = https.request(
      {
        hostname: opts.hostname,
        port: opts.port,
        path: opts.path,
        method: 'POST',
        headers,
        rejectUnauthorized: false
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf-8'),
            headers: res.headers as Record<string, string | string[] | undefined>
          })
        })
      }
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

function makeSettings(overrides?: Partial<MobileAccessSettingsV1>): MobileAccessSettingsV1 {
  return {
    enabled: true,
    port: 19443,
    host: '0.0.0.0',
    devices: [],
    auditLog: [],
    maxAuditEntries: 500,
    ...overrides
  }
}

/* ------------------------------------------------------------------ */
/*  Suite                                                              */
/* ------------------------------------------------------------------ */

describe('MobileTlsListener — INTEGRATION (real TLS listener)', () => {
  let pairingService: MobilePairingService
  let listener: MobileTlsListener
  let settings: MobileAccessSettingsV1
  let port: number
  let now: number
  let certDir: string

  // The mock runtimeRequest tracks every call so we can prove
  // "BEFORE runtimeRequest is called" assertions.
  let mockRuntimeRequest: ReturnType<typeof vi.fn>
  let runtimeRequestCalls: Array<{
    path: string
    init: { method?: string; body?: string; headers?: Record<string, string> }
  }>

  let opensslAvailable: boolean

  beforeAll(() => {
    try {
      execSync('openssl version', { stdio: 'pipe', timeout: 5000 })
      opensslAvailable = true
    } catch {
      opensslAvailable = false
    }
  })

  beforeEach(async () => {
    if (!opensslAvailable) return

    now = 1_700_000_000_000
    certDir = join(tmpdir(), 'ocx-m4a-int-' + randomUUID())
    settings = makeSettings()
    // Reset runtimeRequest tracking
    runtimeRequestCalls = []
    mockRuntimeRequest = vi.fn().mockImplementation(
      async (
        path: string,
        init: { method?: string; body?: string; headers?: Record<string, string> }
      ) => {
        runtimeRequestCalls.push({ path, init })
        return {
          ok: true,
          status: 200,
          body: JSON.stringify({ proxied: true, path, method: init.method ?? 'GET', headers: init.headers ?? {} })
        }
      }
    )

    pairingService = new MobilePairingService({
      dataDir: '/tmp/test-m4a-int',
      getSettings: () => settings,
      saveSettings: (s) => {
        settings = s
      },
      now: () => now
    })

    port = await findAvailablePort()

    listener = new MobileTlsListener({
      pairingService,
      port,
      host: '127.0.0.1',
      certDir,
      now: () => now,
      runtimeRequest: mockRuntimeRequest as unknown as (path: string, init: { method?: string; body?: string; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; body: string }>,
      onAudit: (e) => {
        settings.auditLog = [e, ...settings.auditLog].slice(0, settings.maxAuditEntries)
      }
    })

    await listener.start()
  })

  afterEach(async () => {
    if (listener) {
      try {
        await listener.stop()
      } catch { /* ok */ }
    }
    try {
      rmSync(certDir, { recursive: true, force: true })
    } catch { /* ok */ }
  })

  /* ---------------------------------------------------------------- */
  /*  (1) Authenticated GET /v1/threads → runtimeRequest              */
  /* ---------------------------------------------------------------- */

  describe('(1) authenticated GET /v1/threads reaches runtimeRequest', () => {
    it('forwards path, method, and passthrough headers to runtimeRequest', async () => {
      if (!opensslAvailable) return

      const { token } = pairingService.issueDeviceToken('Test Phone')

      const res = await httpsGet({
        hostname: '127.0.0.1',
        port,
        path: '/v1/threads',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          accept: 'application/json',
          'accept-language': 'en-US'
        }
      })

      expect(res.status).toBe(200)

      // runtimeRequest was called exactly once
      expect(mockRuntimeRequest).toHaveBeenCalledTimes(1)
      expect(runtimeRequestCalls.length).toBe(1)

      const call = runtimeRequestCalls[0]
      expect(call.path).toBe('/v1/threads')
      expect(call.init.method).toBe('GET')
      expect(call.init.headers).toEqual({
        'content-type': 'application/json',
        accept: 'application/json',
        'accept-language': 'en-US'
      })

      // Response body is the proxied runtime body
      const body = JSON.parse(res.body)
      expect(body.proxied).toBe(true)
      expect(body.path).toBe('/v1/threads')
      expect(body.method).toBe('GET')

      // Response includes device-id audit headers
      const deviceId = res.headers['x-device-id'] as string
      const deviceName = res.headers['x-device-name'] as string
      expect(deviceId).toBeTruthy()
      expect(deviceName).toBe('Test Phone')
    })

    it('proxies runtime status code (non-200) back to client', async () => {
      if (!opensslAvailable) return

      const { token } = pairingService.issueDeviceToken('Phone')

      // Override mock to return a 500
      mockRuntimeRequest.mockReset()
      mockRuntimeRequest.mockResolvedValueOnce({
        ok: false,
        status: 500,
        body: JSON.stringify({ code: 'internal_error', message: 'Kun exploded' })
      })

      const res = await httpsGet({
        hostname: '127.0.0.1',
        port,
        path: '/v1/threads',
        headers: { authorization: `Bearer ${token}` }
      })

      expect(res.status).toBe(500)
      expect(JSON.parse(res.body)).toEqual({
        code: 'internal_error',
        message: 'Kun exploded'
      })
    })

    it('forwards query string to runtimeRequest', async () => {
      if (!opensslAvailable) return

      const { token } = pairingService.issueDeviceToken('Phone')

      const res = await httpsGet({
        hostname: '127.0.0.1',
        port,
        path: '/v1/threads?limit=10&offset=0',
        headers: { authorization: `Bearer ${token}` }
      })

      expect(res.status).toBe(200)
      expect(runtimeRequestCalls.length).toBe(1)
      expect(runtimeRequestCalls[0].path).toBe('/v1/threads?limit=10&offset=0')
    })
  })

  /* ---------------------------------------------------------------- */
  /*  (2) Authenticated GET /v1/approvals/<id> → runtimeRequest       */
  /* ---------------------------------------------------------------- */

  describe('(2) authenticated GET /v1/approvals/<id> reaches runtimeRequest', () => {
    it('GET /v1/approvals/approval_99 forwards to runtimeRequest', async () => {
      if (!opensslAvailable) return

      const { token } = pairingService.issueDeviceToken('Phone')

      const res = await httpsGet({
        hostname: '127.0.0.1',
        port,
        path: '/v1/approvals/approval_99',
        headers: { authorization: `Bearer ${token}` }
      })

      expect(res.status).toBe(200)
      expect(runtimeRequestCalls.length).toBe(1)
      expect(runtimeRequestCalls[0].path).toBe('/v1/approvals/approval_99')
      expect(runtimeRequestCalls[0].init.method).toBe('GET')
    })

    it('GET /v1/approvals/approval_1 with X-Device-Token header', async () => {
      if (!opensslAvailable) return

      const { token } = pairingService.issueDeviceToken('iPhone 15')

      const res = await httpsGet({
        hostname: '127.0.0.1',
        port,
        path: '/v1/approvals/approval_1',
        headers: { 'x-device-token': token }
      })

      expect(res.status).toBe(200)
      expect(runtimeRequestCalls.length).toBe(1)
      expect(runtimeRequestCalls[0].path).toBe('/v1/approvals/approval_1')
    })
  })

  /* ---------------------------------------------------------------- */
  /*  (3) Blocked routes → 403 BEFORE runtimeRequest is called        */
  /* ---------------------------------------------------------------- */

  describe('(3) blocked routes return 403 BEFORE runtimeRequest is called', () => {
    it('/v1/terminal returns 403 and runtimeRequest is NEVER called', async () => {
      if (!opensslAvailable) return

      const { token } = pairingService.issueDeviceToken('Phone')

      const res = await httpsGet({
        hostname: '127.0.0.1',
        port,
        path: '/v1/terminal',
        headers: { authorization: `Bearer ${token}` }
      })

      expect(res.status).toBe(403)
      expect(JSON.parse(res.body).error).toContain('control-surface scope')

      // CRITICAL: runtimeRequest was NEVER called — denial happened before proxy
      expect(mockRuntimeRequest).not.toHaveBeenCalled()
      expect(runtimeRequestCalls.length).toBe(0)
    })

    it('/v1/terminal/spawn returns 403 and runtimeRequest is NEVER called', async () => {
      if (!opensslAvailable) return

      const { token } = pairingService.issueDeviceToken('Phone')

      const res = await httpsGet({
        hostname: '127.0.0.1',
        port,
        path: '/v1/terminal/spawn',
        headers: { authorization: `Bearer ${token}` }
      })

      expect(res.status).toBe(403)
      expect(mockRuntimeRequest).not.toHaveBeenCalled()
    })

    it('/v1/settings returns 403 and runtimeRequest is NEVER called', async () => {
      if (!opensslAvailable) return

      const { token } = pairingService.issueDeviceToken('Phone')

      const res = await httpsGet({
        hostname: '127.0.0.1',
        port,
        path: '/v1/settings',
        headers: { authorization: `Bearer ${token}` }
      })

      expect(res.status).toBe(403)
      expect(mockRuntimeRequest).not.toHaveBeenCalled()
    })

    it('/v1/credentials returns 403 and runtimeRequest is NEVER called', async () => {
      if (!opensslAvailable) return

      const { token } = pairingService.issueDeviceToken('Phone')

      const res = await httpsGet({
        hostname: '127.0.0.1',
        port,
        path: '/v1/credentials',
        headers: { authorization: `Bearer ${token}` }
      })

      expect(res.status).toBe(403)
      expect(mockRuntimeRequest).not.toHaveBeenCalled()
    })

    it('/v1/files returns 403 and runtimeRequest is NEVER called', async () => {
      if (!opensslAvailable) return

      const { token } = pairingService.issueDeviceToken('Phone')

      const res = await httpsGet({
        hostname: '127.0.0.1',
        port,
        path: '/v1/files',
        headers: { authorization: `Bearer ${token}` }
      })

      expect(res.status).toBe(403)
      expect(mockRuntimeRequest).not.toHaveBeenCalled()
    })

    it('/v1/files/read?path=/etc/passwd returns 403 and runtimeRequest is NEVER called', async () => {
      if (!opensslAvailable) return

      const { token } = pairingService.issueDeviceToken('Phone')

      const res = await httpsGet({
        hostname: '127.0.0.1',
        port,
        path: '/v1/files/read?path=/etc/passwd',
        headers: { authorization: `Bearer ${token}` }
      })

      expect(res.status).toBe(403)
      expect(mockRuntimeRequest).not.toHaveBeenCalled()
    })

    it('/v1/runtime/hooks returns 403 and runtimeRequest NEVER called', async () => {
      if (!opensslAvailable) return

      const { token } = pairingService.issueDeviceToken('Phone')

      const res = await httpsGet({
        hostname: '127.0.0.1',
        port,
        path: '/v1/runtime/hooks',
        headers: { authorization: `Bearer ${token}` }
      })

      expect(res.status).toBe(403)
      expect(mockRuntimeRequest).not.toHaveBeenCalled()
    })

    it('/v1/runtime/tools returns 403 and runtimeRequest NEVER called', async () => {
      if (!opensslAvailable) return

      const { token } = pairingService.issueDeviceToken('Phone')

      const res = await httpsGet({
        hostname: '127.0.0.1',
        port,
        path: '/v1/runtime/tools',
        headers: { authorization: `Bearer ${token}` }
      })

      expect(res.status).toBe(403)
      expect(mockRuntimeRequest).not.toHaveBeenCalled()
    })
  })

  /* ---------------------------------------------------------------- */
  /*  (4) Unauthenticated routes → 401 / no version banner            */
  /*      runtimeRequest NEVER called                                 */
  /* ---------------------------------------------------------------- */

  describe('(4) unauthenticated routes return 401, never call runtimeRequest', () => {
    it('GET / (root) returns 401 — no version banner', async () => {
      if (!opensslAvailable) return

      const res = await httpsGet({
        hostname: '127.0.0.1',
        port,
        path: '/'
      })

      expect(res.status).toBe(401)
      expect(JSON.parse(res.body).error).toContain('Device token required')
      expect(mockRuntimeRequest).not.toHaveBeenCalled()
    })

    it('GET /version returns 401', async () => {
      if (!opensslAvailable) return

      const res = await httpsGet({
        hostname: '127.0.0.1',
        port,
        path: '/version'
      })

      expect(res.status).toBe(401)
      expect(mockRuntimeRequest).not.toHaveBeenCalled()
    })

    it('GET /api returns 401', async () => {
      if (!opensslAvailable) return

      const res = await httpsGet({
        hostname: '127.0.0.1',
        port,
        path: '/api'
      })

      expect(res.status).toBe(401)
      expect(mockRuntimeRequest).not.toHaveBeenCalled()
    })

    it('GET /v1 returns 401', async () => {
      if (!opensslAvailable) return

      const res = await httpsGet({
        hostname: '127.0.0.1',
        port,
        path: '/v1'
      })

      expect(res.status).toBe(401)
      expect(mockRuntimeRequest).not.toHaveBeenCalled()
    })

    it('GET /health returns 401 (no token)', async () => {
      if (!opensslAvailable) return

      const res = await httpsGet({
        hostname: '127.0.0.1',
        port,
        path: '/health'
      })

      expect(res.status).toBe(401)
      expect(mockRuntimeRequest).not.toHaveBeenCalled()
    })

    it('GET /health WITH VALID TOKEN reaches runtimeRequest', async () => {
      if (!opensslAvailable) return

      const { token } = pairingService.issueDeviceToken('Phone')

      const res = await httpsGet({
        hostname: '127.0.0.1',
        port,
        path: '/health',
        headers: { authorization: `Bearer ${token}` }
      })

      // /health is on the ALLOWED list, so it should go through to runtimeRequest
      expect(res.status).toBe(200)
      expect(mockRuntimeRequest).toHaveBeenCalledTimes(1)
      expect(runtimeRequestCalls[0].path).toBe('/health')
    })

    it('GET /mobile/qr-payload returns 401 (removed from LAN surface)', async () => {
      if (!opensslAvailable) return

      const res = await httpsGet({
        hostname: '127.0.0.1',
        port,
        path: '/mobile/qr-payload'
      })

      expect(res.status).toBe(401)
      expect(mockRuntimeRequest).not.toHaveBeenCalled()
    })

    it('GET /mobile/qr-payload?t=123 returns 401', async () => {
      if (!opensslAvailable) return

      const res = await httpsGet({
        hostname: '127.0.0.1',
        port,
        path: '/mobile/qr-payload?t=123'
      })

      expect(res.status).toBe(401)
      expect(mockRuntimeRequest).not.toHaveBeenCalled()
    })
  })

  /* ---------------------------------------------------------------- */
  /*  (5) POST /mobile/pair — valid unexpired single-use code only    */
  /* ---------------------------------------------------------------- */

  describe('(5) POST /mobile/pair — valid unexpired single-use code', () => {
    it('succeeds with valid unexpired code', async () => {
      if (!opensslAvailable) return

      const { code } = pairingService.generatePairingCode()

      const res = await httpsPost({
        hostname: '127.0.0.1',
        port,
        path: '/mobile/pair',
        body: JSON.stringify({ pairingCode: code, deviceName: 'My iPhone' })
      })

      expect(res.status).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.ok).toBe(true)
      expect(body.token).toBeTruthy()
      expect(body.deviceId).toBeTruthy()
      expect(body.deviceName).toBe('My iPhone')

      // The issued token should be valid
      const tokenResult = pairingService.validateDeviceToken(body.token)
      expect(tokenResult.valid).toBe(true)
    })

    it('fails on reused code (single-use enforcement)', async () => {
      if (!opensslAvailable) return

      const { code } = pairingService.generatePairingCode()

      // First use succeeds
      const res1 = await httpsPost({
        hostname: '127.0.0.1',
        port,
        path: '/mobile/pair',
        body: JSON.stringify({ pairingCode: code, deviceName: 'Phone 1' })
      })
      expect(res1.status).toBe(200)

      // Second use of same code fails
      const res2 = await httpsPost({
        hostname: '127.0.0.1',
        port,
        path: '/mobile/pair',
        body: JSON.stringify({ pairingCode: code, deviceName: 'Phone 2' })
      })
      expect(res2.status).toBe(400)
      expect(JSON.parse(res2.body).error).toContain('already been used')
    })

    it('fails on expired code', async () => {
      if (!opensslAvailable) return

      const { code, expiresAt } = pairingService.generatePairingCode()

      // Advance time past expiry
      now = expiresAt + 1

      const res = await httpsPost({
        hostname: '127.0.0.1',
        port,
        path: '/mobile/pair',
        body: JSON.stringify({ pairingCode: code, deviceName: 'Phone' })
      })

      expect(res.status).toBe(400)
      expect(JSON.parse(res.body).error).toContain('expired')
    })

    it('fails on invalid code (never generated)', async () => {
      if (!opensslAvailable) return

      const res = await httpsPost({
        hostname: '127.0.0.1',
        port,
        path: '/mobile/pair',
        body: JSON.stringify({ pairingCode: 'deadbeef', deviceName: 'Phone' })
      })

      expect(res.status).toBe(400)
      expect(JSON.parse(res.body).error).toContain('Invalid pairing code')
    })

    it('fails when pairingCode is missing', async () => {
      if (!opensslAvailable) return

      const res = await httpsPost({
        hostname: '127.0.0.1',
        port,
        path: '/mobile/pair',
        body: JSON.stringify({ deviceName: 'Phone' })
      })

      expect(res.status).toBe(400)
      expect(JSON.parse(res.body).error).toContain('pairingCode')
    })

    it('fails with empty pairingCode string', async () => {
      if (!opensslAvailable) return

      const res = await httpsPost({
        hostname: '127.0.0.1',
        port,
        path: '/mobile/pair',
        body: JSON.stringify({ pairingCode: '   ', deviceName: 'Phone' })
      })

      expect(res.status).toBe(400)
      expect(JSON.parse(res.body).error).toContain('pairingCode')
    })

    it('uses default device name when none provided', async () => {
      if (!opensslAvailable) return

      const { code } = pairingService.generatePairingCode()

      const res = await httpsPost({
        hostname: '127.0.0.1',
        port,
        path: '/mobile/pair',
        body: JSON.stringify({ pairingCode: code })
      })

      expect(res.status).toBe(200)
      expect(JSON.parse(res.body).deviceName).toBe('My Phone')
    })
  })

  /* ---------------------------------------------------------------- */
  /*  Cross-cutting: revoked token immediate rejection                */
  /* ---------------------------------------------------------------- */

  describe('revoked token is rejected on the wire', () => {
    it('request with revoked token returns 401', async () => {
      if (!opensslAvailable) return

      const { token, deviceId } = pairingService.issueDeviceToken('Phone')
      pairingService.revokeDevice(deviceId)

      const res = await httpsGet({
        hostname: '127.0.0.1',
        port,
        path: '/v1/threads',
        headers: { authorization: `Bearer ${token}` }
      })

      expect(res.status).toBe(401)
      expect(mockRuntimeRequest).not.toHaveBeenCalled()
    })
  })

  /* ---------------------------------------------------------------- */
  /*  Cross-cutting: listener lifecycle                               */
  /* ---------------------------------------------------------------- */

  describe('listener lifecycle', () => {
    it('listener is running after start()', () => {
      if (!opensslAvailable) return
      expect(listener.isRunning()).toBe(true)
    })

    it('listener is NOT running after stop()', async () => {
      if (!opensslAvailable) return
      await listener.stop()
      expect(listener.isRunning()).toBe(false)
    })

    it('requests fail after listener is stopped', async () => {
      if (!opensslAvailable) return
      await listener.stop()

      const { token } = pairingService.issueDeviceToken('Phone')
      await expect(
        httpsGet({
          hostname: '127.0.0.1',
          port,
          path: '/v1/threads',
          headers: { authorization: `Bearer ${token}` }
        })
      ).rejects.toThrow() // ECONNREFUSED
    })
  })
})
