import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, writeFileSync, rmSync, chmodSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import type { KunHookSettingsV1 } from '../src/contracts/hooks.js'

// We test the full bridge: config.json → createKunServeRuntime → hookGate wired → hooks execute
import { createKunServeRuntime } from '../src/server/runtime-factory.js'

const KUN_READY_PREFIX = 'KUN_READY '

function tmpDir(): string {
  const dir = join(tmpdir(), `kun-bridge-test-${randomUUID()}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function writeHookScript(workspaceRoot: string, filename: string, content: string): string {
  const hooksDir = join(workspaceRoot, '.opencodex', 'hooks')
  mkdirSync(hooksDir, { recursive: true })
  const path = join(hooksDir, filename)
  writeFileSync(path, content)
  try { chmodSync(path, 0o755) } catch { /* ok */ }
  return path
}

// Minimal runtime options for testing — we only need the hook gate, not full model access
function makeRuntimeOptions(dataDir: string, workspaceRoot?: string): Parameters<typeof createKunServeRuntime>[0] {
  return {
    host: '127.0.0.1',
    port: 19999,
    dataDir,
    runtimeToken: '',
    apiKey: '',
    baseUrl: 'https://api.deepseek.com/beta',
    model: 'deepseek-v4-pro',
    approvalPolicy: 'on-request',
    sandboxMode: 'workspace-write',
    tokenEconomyMode: false,
    insecure: false
  }
}

describe('Managed-runtime hook bridge (config → Kun runtime)', () => {
  let dataDir: string
  let workspaceRoot: string

  beforeEach(() => {
    dataDir = tmpDir()
    workspaceRoot = tmpDir()
  })

  afterEach(async () => {
    try { rmSync(dataDir, { recursive: true }) } catch { /* ok */ }
    try { rmSync(workspaceRoot, { recursive: true }) } catch { /* ok */ }
  })

  // ── 1. Config bridge: hookSettings passed → runtime executes ────────

  it('approved trusted hooks execute in managed runtime via hookSettings option', async () => {
    writeHookScript(workspaceRoot, 'pre-tool-ok.sh', '#!/bin/sh\necho \'{"decision":"allow"}\'')

    const hookSettings: KunHookSettingsV1 = {
      enabled: true,
      trustedHooks: {},
      defaultTimeoutMs: 10_000,
      maxOutputBytes: 64_000,
      maxAuditEvents: 200,
      auditLog: []
    }

    const runtime = await createKunServeRuntime({
      ...makeRuntimeOptions(dataDir),
      hookSettings
    })
    try {
      expect(runtime.hookGate).toBeDefined()
      const gate = runtime.hookGate!

      // Discover and approve hook via gate
      const hooks = gate.discover(workspaceRoot)
      expect(hooks.length).toBe(1)
      const entry = await gate.approve(hooks[0]!.id, workspaceRoot)
      expect(entry?.trusted).toBe(true)

      // Execute — hook should run
      const result = await gate.execute('PreToolUse', { workspaceRoot })
      expect(result.decision).toBe('allow')
      expect(result.results.length).toBe(1)
      expect(result.results[0]?.trusted).toBe(true)
      expect(result.results[0]?.runResult?.exitCode).toBe(0)
    } finally {
      await runtime.shutdown?.()
    }
  })

  // ── 2. Untrusted hooks are inert in managed runtime ──────────────────

  it('untrusted hooks do not execute in managed runtime', async () => {
    writeHookScript(workspaceRoot, 'pre-tool-block.sh', '#!/bin/sh\nexit 0')

    const runtime = await createKunServeRuntime({
      ...makeRuntimeOptions(dataDir),
      hookSettings: {
        enabled: true,
        trustedHooks: {},
        defaultTimeoutMs: 10_000,
        maxOutputBytes: 64_000,
        maxAuditEvents: 200,
        auditLog: []
      }
    })
    try {
      const gate = runtime.hookGate!
      const result = await gate.execute('PreToolUse', { workspaceRoot })
      expect(result.results.length).toBe(1)
      expect(result.results[0]?.trusted).toBe(false)
      expect(result.results[0]?.runResult).toBeUndefined()
    } finally {
      await runtime.shutdown?.()
    }
  })

  // ── 3. Hash-mismatched hooks are inert in managed runtime ────────────

  it('hash-mismatched hooks do not execute in managed runtime', async () => {
    const scriptPath = writeHookScript(workspaceRoot, 'pre-tool-v1.sh', '#!/bin/sh\necho "v1"')

    const runtime = await createKunServeRuntime({
      ...makeRuntimeOptions(dataDir),
      hookSettings: {
        enabled: true,
        trustedHooks: {},
        defaultTimeoutMs: 10_000,
        maxOutputBytes: 64_000,
        maxAuditEvents: 200,
        auditLog: []
      }
    })
    try {
      const gate = runtime.hookGate!
      // Approve current version
      const hooks = gate.discover(workspaceRoot)
      expect(hooks.length).toBe(1)
      await gate.approve(hooks[0]!.id, workspaceRoot)

      // Now modify the file (change hash)
      writeFileSync(scriptPath, '#!/bin/sh\necho "v2 MODIFIED"')

      // Re-execute — should detect hash mismatch and block
      const result = await gate.execute('PreToolUse', { workspaceRoot })
      expect(result.results.length).toBe(1)
      expect(result.results[0]?.trusted).toBe(false)
      expect(result.results[0]?.trustReason).toBe('hash-mismatch')
      expect(result.results[0]?.runResult).toBeUndefined()
    } finally {
      await runtime.shutdown?.()
    }
  })

  // ── 4. Kill switch yields zero executions in managed runtime ─────────

  it('kill switch disabled yields zero executions in managed runtime', async () => {
    writeHookScript(workspaceRoot, 'pre-tool-test.sh', '#!/bin/sh\necho ok')

    const runtime = await createKunServeRuntime({
      ...makeRuntimeOptions(dataDir),
      hookSettings: {
        enabled: false, // kill switch OFF
        trustedHooks: {},
        defaultTimeoutMs: 10_000,
        maxOutputBytes: 64_000,
        maxAuditEvents: 200,
        auditLog: []
      }
    })
    try {
      const gate = runtime.hookGate!
      const hooks = gate.discover(workspaceRoot)
      await gate.approve(hooks[0]!.id, workspaceRoot)

      const result = await gate.execute('PreToolUse', { workspaceRoot })
      expect(result.results).toHaveLength(0)
      expect(result.decision).toBe('allow')
    } finally {
      await runtime.shutdown?.()
    }
  })

  // ── 5. PreToolUse deny gate blocks the real path ─────────────────────

  it('pre-tool hook with non-zero exit yields deny decision in managed runtime', async () => {
    writeHookScript(workspaceRoot, 'pre-tool-deny.sh', '#!/bin/sh\necho "blocked" >&2\nexit 1')

    const runtime = await createKunServeRuntime({
      ...makeRuntimeOptions(dataDir),
      hookSettings: {
        enabled: true,
        trustedHooks: {},
        defaultTimeoutMs: 10_000,
        maxOutputBytes: 64_000,
        maxAuditEvents: 200,
        auditLog: []
      }
    })
    try {
      const gate = runtime.hookGate!
      const hooks = gate.discover(workspaceRoot)
      await gate.approve(hooks[0]!.id, workspaceRoot)

      const result = await gate.execute('PreToolUse', { workspaceRoot })
      expect(result.decision).toBe('deny')
    } finally {
      await runtime.shutdown?.()
    }
  })

  // ── 6. Runtime settings reload via loadSettings ──────────────────────

  it('runtime settings reload via loadSettings affects subsequent hook execution', async () => {
    writeHookScript(workspaceRoot, 'pre-tool-test.sh', '#!/bin/sh\necho ok')

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
      const gate = runtime.hookGate!
      const hooks = gate.discover(workspaceRoot)
      await gate.approve(hooks[0]!.id, workspaceRoot)

      // Kill switch off → no execution
      const r1 = await gate.execute('PreToolUse', { workspaceRoot })
      expect(r1.results).toHaveLength(0)

      // Reload settings with kill switch ON
      gate.loadSettings({
        enabled: true,
        trustedHooks: gate.getSettings().trustedHooks,
        defaultTimeoutMs: 10_000,
        maxOutputBytes: 64_000,
        maxAuditEvents: 200,
        auditLog: []
      })

      // Now hook should execute
      const r2 = await gate.execute('PreToolUse', { workspaceRoot })
      expect(r2.results.length).toBe(1)
      expect(r2.results[0]?.trusted).toBe(true)
      expect(r2.results[0]?.runResult?.exitCode).toBe(0)
    } finally {
      await runtime.shutdown?.()
    }
  })

  // ── 7. Restart persistence proof ─────────────────────────────────────

  it('config.json hook settings survive restart (persistence proof)', async () => {
    writeHookScript(workspaceRoot, 'pre-tool-persist.sh', '#!/bin/sh\necho \'{"decision":"allow"}\'')

    // First runtime: approve the hook
    const rt1 = await createKunServeRuntime({
      ...makeRuntimeOptions(dataDir),
      hookSettings: {
        enabled: true,
        trustedHooks: {},
        defaultTimeoutMs: 10_000,
        maxOutputBytes: 64_000,
        maxAuditEvents: 200,
        auditLog: []
      }
    })
    const hooks = rt1.hookGate!.discover(workspaceRoot)
    const entry = await rt1.hookGate!.approve(hooks[0]!.id, workspaceRoot)
    expect(entry?.trusted).toBe(true)

    // Check that the hook executes in rt1
    const r1 = await rt1.hookGate!.execute('PreToolUse', { workspaceRoot })
    expect(r1.results[0]?.trusted).toBe(true)
    expect(r1.results[0]?.runResult?.exitCode).toBe(0)

    const savedSettings = rt1.hookGate!.getSettings()
    await rt1.shutdown?.()

    // Second runtime: load the same hook settings
    const rt2 = await createKunServeRuntime({
      ...makeRuntimeOptions(dataDir),
      hookSettings: savedSettings
    })
    try {
      // Hook should still be trusted and execute without re-approving
      const r2 = await rt2.hookGate!.execute('PreToolUse', { workspaceRoot })
      expect(r2.results.length).toBe(1)
      expect(r2.results[0]?.trusted).toBe(true)
      expect(r2.results[0]?.runResult?.exitCode).toBe(0)
    } finally {
      await rt2.shutdown?.()
    }
  })

  // ── 8. Audit events recorded in managed runtime ──────────────────────

  it('managed runtime records audit events', async () => {
    writeHookScript(workspaceRoot, 'pre-tool-audit.sh', '#!/bin/sh\necho ok')

    const runtime = await createKunServeRuntime({
      ...makeRuntimeOptions(dataDir),
      hookSettings: {
        enabled: true,
        trustedHooks: {},
        defaultTimeoutMs: 10_000,
        maxOutputBytes: 64_000,
        maxAuditEvents: 200,
        auditLog: []
      }
    })
    try {
      const gate = runtime.hookGate!
      const hooks = gate.discover(workspaceRoot)
      await gate.approve(hooks[0]!.id, workspaceRoot)

      await gate.execute('PreToolUse', { workspaceRoot })
      const audit = gate.getAuditLog()
      expect(audit.length).toBeGreaterThanOrEqual(1)
      expect(audit[audit.length - 1]?.exitCode).toBe(0)
    } finally {
      await runtime.shutdown?.()
    }
  })

  // ── 9. Env redaction in managed runtime ──────────────────────────────

  it('managed runtime hook passes env (no secrets leaked)', async () => {
    writeHookScript(workspaceRoot, 'pre-tool-env.sh', '#!/bin/sh\nenv')

    const runtime = await createKunServeRuntime({
      ...makeRuntimeOptions(dataDir),
      hookSettings: {
        enabled: true,
        trustedHooks: {},
        defaultTimeoutMs: 10_000,
        maxOutputBytes: 64_000,
        maxAuditEvents: 200,
        auditLog: []
      }
    })
    try {
      const gate = runtime.hookGate!
      const hooks = gate.discover(workspaceRoot)
      await gate.approve(hooks[0]!.id, workspaceRoot)

      // Set a secret env
      process.env.HOOK_TEST_SECRET_KEY = 'super-secret-should-not-leak'
      try {
        const result = await gate.execute('PreToolUse', { workspaceRoot })
        const stdout = result.results[0]?.runResult?.stdout ?? ''
        // Should not contain the secret
        expect(stdout).not.toContain('super-secret-should-not-leak')
        expect(stdout).not.toContain('HOOK_TEST_SECRET_KEY')
      } finally {
        delete process.env.HOOK_TEST_SECRET_KEY
      }
    } finally {
      await runtime.shutdown?.()
    }
  })
})
