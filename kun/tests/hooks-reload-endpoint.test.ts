import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import type { KunHookSettingsV1 } from '../src/contracts/hooks.js'

import { createKunServeRuntime } from '../src/server/runtime-factory.js'
import { reloadHookSettings } from '../src/server/routes/hooks-reload.js'

function tmpDir(): string {
  const dir = join(tmpdir(), `kun-reload-test-${randomUUID()}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function makeRuntimeOptions(dataDir: string) {
  return {
    host: '127.0.0.1',
    port: 19998,
    dataDir,
    runtimeToken: '',
    apiKey: '',
    baseUrl: 'https://api.deepseek.com/beta',
    model: 'deepseek-v4-pro',
    approvalPolicy: 'on-request' as const,
    sandboxMode: 'workspace-write' as const,
    tokenEconomyMode: false,
    insecure: true
  }
}

function makeReloadRequest(body: unknown): Request {
  return new Request('http://localhost/v1/runtime/hooks/reload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

describe('POST /v1/runtime/hooks/reload endpoint', () => {
  let dataDir: string

  beforeEach(() => {
    dataDir = tmpDir()
  })

  afterEach(() => {
    try { rmSync(dataDir, { recursive: true }) } catch { /* ok */ }
  })

  it('reloads hook settings and changes subsequent behavior', async () => {
    const runtime = await createKunServeRuntime({
      ...makeRuntimeOptions(dataDir),
      hookSettings: {
        enabled: false,
        trustedHooks: {},
        defaultTimeoutMs: 10_000,
        maxOutputBytes: 64_000,
        maxAuditEvents: 200,
        auditLog: []
      }
    })
    try {
      // Initially disabled
      expect(runtime.hookGate!.getSettings().enabled).toBe(false)

      // Reload with new settings
      const newSettings: KunHookSettingsV1 = {
        enabled: true,
        trustedHooks: { 'test/hook': { id: 'test/hook', scriptPath: '/tmp/hook.sh', pinnedContent: 'ok', contentHash: 'abc', scope: 'user', approvedAt: '2024-01-01T00:00:00Z', trusted: true } },
        defaultTimeoutMs: 5_000,
        maxOutputBytes: 32_000,
        maxAuditEvents: 50,
        auditLog: [{ hookId: 'prev', phase: 'PreToolUse', startedAt: '2024-01-01T00:00:00Z', durationMs: 10, exitCode: 0, signal: null, stdoutBytes: 5, stderrBytes: 0 }]
      }

      const res = await reloadHookSettings(runtime, makeReloadRequest(newSettings))
      expect(res.status).toBe(200)
      const body = JSON.parse(res.body) as { ok: boolean }
      expect(body.ok).toBe(true)

      const current = runtime.hookGate!.getSettings()
      expect(current.enabled).toBe(true)
      expect(current.defaultTimeoutMs).toBe(5_000)
      expect(current.maxOutputBytes).toBe(32_000)
      expect(current.maxAuditEvents).toBe(50)
      expect(current.trustedHooks['test/hook']?.trusted).toBe(true)
      expect(current.auditLog.length).toBe(1)
    } finally {
      await runtime.shutdown?.()
    }
  })

  it('rejects non-JSON body', async () => {
    const runtime = await createKunServeRuntime({
      ...makeRuntimeOptions(dataDir),
      hookSettings: {
        enabled: false,
        trustedHooks: {},
        defaultTimeoutMs: 10_000,
        maxOutputBytes: 64_000,
        maxAuditEvents: 200,
        auditLog: []
      }
    })
    try {
      const req = new Request('http://localhost/v1/runtime/hooks/reload', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'not json'
      })
      const res = await reloadHookSettings(runtime, req)
      expect(res.status).toBe(400)
    } finally {
      await runtime.shutdown?.()
    }
  })

  it('returns 401 when unauthorized', async () => {
    const runtime = await createKunServeRuntime({
      ...makeRuntimeOptions(dataDir),
      runtimeToken: 'secret-token',
      insecure: false
    })
    try {
      const req = makeReloadRequest({ enabled: true })
      const res = await reloadHookSettings(runtime, req)
      expect(res.status).toBe(401)
    } finally {
      await runtime.shutdown?.()
    }
  })
})
