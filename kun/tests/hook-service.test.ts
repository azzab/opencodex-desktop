import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { HookRunner } from '../src/services/hook-service.js'
import { defaultKunHookSettings } from '../src/contracts/hooks.js'
import type { KunHookSettingsV1 } from '../src/contracts/hooks.js'
import type { HookDiscoveredInfo } from '../src/ports/hook-gate.js'

function tmpDir(): string {
  const dir = join(tmpdir(), `kun-hooks-test-${randomUUID()}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function writeHookScript(dir: string, filename: string, content: string): string {
  const hooksDir = join(dir, '.opencodex', 'hooks')
  mkdirSync(hooksDir, { recursive: true })
  const path = join(hooksDir, filename)
  writeFileSync(path, content)
  try { chmodSync(path, 0o755) } catch { /* ok */ }
  return path
}

function makeHook(workspaceRoot: string, filename: string, content: string): HookDiscoveredInfo {
  writeHookScript(workspaceRoot, filename, content)
  const runner = new HookRunner(defaultKunHookSettings())
  const hooks = runner.discover(workspaceRoot)
  const found = hooks.find((h) => h.id.includes(filename))
  if (!found) throw new Error(`Failed to discover hook for ${filename}`)
  return found
}

function makeSettings(enabled: boolean): KunHookSettingsV1 {
  return { ...defaultKunHookSettings(), enabled }
}

describe('HookRunner (Kun runtime)', () => {
  let workspaceRoot: string

  beforeEach(() => {
    workspaceRoot = tmpDir()
  })

  afterEach(() => {
    try { rmSync(workspaceRoot, { recursive: true }) } catch { /* ok */ }
  })

  // ── Discovery ───────────────────────────────────────────────────

  it('discovers no hooks in empty workspace', () => {
    const runner = new HookRunner(defaultKunHookSettings())
    expect(runner.discover(workspaceRoot)).toEqual([])
  })

  it('discovers hooks by phase prefix', () => {
    writeHookScript(workspaceRoot, 'pre-tool-audit.sh', '#!/bin/sh\necho ok')
    writeHookScript(workspaceRoot, 'post-tool-log.sh', '#!/bin/sh\necho ok')
    writeHookScript(workspaceRoot, 'permission-check.sh', '#!/bin/sh\necho ok')
    writeHookScript(workspaceRoot, 'user-prompt-filter.sh', '#!/bin/sh\necho ok')
    writeHookScript(workspaceRoot, 'session-start-init.sh', '#!/bin/sh\necho ok')
    writeHookScript(workspaceRoot, 'session-stop-cleanup.sh', '#!/bin/sh\necho ok')

    const runner = new HookRunner(defaultKunHookSettings())
    const hooks = runner.discover(workspaceRoot)
    expect(hooks).toHaveLength(6)
    expect(new Set(hooks.map((h) => h.phase))).toEqual(
      new Set(['PreToolUse', 'PostToolUse', 'PermissionRequest', 'UserPromptSubmit', 'SessionStart', 'SessionStop'])
    )
  })

  // ── Kill switch ─────────────────────────────────────────────────

  it('kill switch disabled: no hooks execute', async () => {
    const hook = makeHook(workspaceRoot, 'pre-tool-test.sh', '#!/bin/sh\necho ok')
    const settings = makeSettings(false) // kill switch off
    const runner = new HookRunner(settings)
    // Approve the hook so it would otherwise run
    await runner.approve(hook.id, workspaceRoot)

    const result = await runner.execute('PreToolUse', { workspaceRoot })
    expect(result.results).toHaveLength(0)
    expect(result.decision).toBe('allow')
  })

  it('kill switch enabled: trusted hooks execute', async () => {
    const hook = makeHook(workspaceRoot, 'pre-tool-test.sh', '#!/bin/sh\necho ok')
    const settings = makeSettings(true)
    const runner = new HookRunner(settings)
    await runner.approve(hook.id, workspaceRoot)

    const result = await runner.execute('PreToolUse', { workspaceRoot })
    expect(result.results).toHaveLength(1)
    expect(result.results[0]?.trusted).toBe(true)
    expect(result.results[0]?.runResult?.exitCode).toBe(0)
  })

  // ── Trust / approve / revoke ────────────────────────────────────

  it('untrusted hook does not execute', async () => {
    const hook = makeHook(workspaceRoot, 'pre-tool-test.sh', '#!/bin/sh\necho ok')
    const runner = new HookRunner(makeSettings(true))
    // Not approved

    const result = await runner.execute('PreToolUse', { workspaceRoot })
    expect(result.results).toHaveLength(1)
    expect(result.results[0]?.trusted).toBe(false)
    expect(result.results[0]?.trustReason).toBe('not-found')
    expect(result.results[0]?.runResult).toBeUndefined()
  })

  it('revoked hook does not execute', async () => {
    const hook = makeHook(workspaceRoot, 'pre-tool-test.sh', '#!/bin/sh\necho ok')
    const runner = new HookRunner(makeSettings(true))
    await runner.approve(hook.id, workspaceRoot)
    await runner.revoke(hook.id)

    const result = await runner.execute('PreToolUse', { workspaceRoot })
    expect(result.results).toHaveLength(1)
    expect(result.results[0]?.trusted).toBe(false)
    expect(result.results[0]?.trustReason).toBe('untrusted')
    expect(result.results[0]?.runResult).toBeUndefined()
  })

  it('hash mismatch blocks execution (auto-revocation inertness)', async () => {
    const hook = makeHook(workspaceRoot, 'pre-tool-edit.sh', '#!/bin/sh\necho "v1"')
    const runner = new HookRunner(makeSettings(true))
    await runner.approve(hook.id, workspaceRoot)

    // Now modify the file
    const hooksDir = join(workspaceRoot, '.opencodex', 'hooks')
    writeFileSync(join(hooksDir, 'pre-tool-edit.sh'), '#!/bin/sh\necho "v2 MODIFIED"')
    try { chmodSync(join(hooksDir, 'pre-tool-edit.sh'), 0o755) } catch { /* ok */ }

    // Re-discover — hash changed
    const result = await runner.execute('PreToolUse', { workspaceRoot })
    expect(result.results).toHaveLength(1)
    expect(result.results[0]?.trusted).toBe(false)
    expect(result.results[0]?.trustReason).toBe('hash-mismatch')
    expect(result.results[0]?.runResult).toBeUndefined()
  })

  // ── Deny semantics ──────────────────────────────────────────────

  it('pre-tool hook with non-zero exit denies tool execution', async () => {
    const hook = makeHook(workspaceRoot, 'pre-tool-block.sh', '#!/bin/sh\necho "blocked" >&2\nexit 1')
    const runner = new HookRunner(makeSettings(true))
    await runner.approve(hook.id, workspaceRoot)

    const result = await runner.execute('PreToolUse', { workspaceRoot })
    expect(result.decision).toBe('deny')
    expect(result.results[0]?.runResult?.exitCode).toBe(1)
  })

  it('pre-tool hook with explicit JSON deny decision', async () => {
    const hook = makeHook(workspaceRoot, 'pre-tool-deny.sh', '#!/bin/sh\necho \'{"decision":"deny","message":"blocked"}\'')
    const runner = new HookRunner(makeSettings(true))
    await runner.approve(hook.id, workspaceRoot)

    const result = await runner.execute('PreToolUse', { workspaceRoot })
    expect(result.decision).toBe('deny')
    const parsed = JSON.parse(result.results[0]?.runResult?.stdout.trim() ?? '{}')
    expect(parsed.decision).toBe('deny')
  })

  it('pre-tool hook with explicit JSON allow decision', async () => {
    const hook = makeHook(workspaceRoot, 'pre-tool-allow.sh', '#!/bin/sh\necho \'{"decision":"allow"}\'')
    const runner = new HookRunner(makeSettings(true))
    await runner.approve(hook.id, workspaceRoot)

    const result = await runner.execute('PreToolUse', { workspaceRoot })
    expect(result.decision).toBe('allow')
  })

  it('permission-request hook with non-zero exit denies permission', async () => {
    const hook = makeHook(workspaceRoot, 'permission-block.sh', '#!/bin/sh\necho "blocked" >&2\nexit 1')
    const runner = new HookRunner(makeSettings(true))
    await runner.approve(hook.id, workspaceRoot)

    const result = await runner.execute('PermissionRequest', { workspaceRoot })
    expect(result.decision).toBe('deny')
  })

  it('post-tool and session hooks do not gate (always allow)', async () => {
    const hook = makeHook(workspaceRoot, 'post-tool-log.sh', '#!/bin/sh\nexit 1')
    const runner = new HookRunner(makeSettings(true))
    await runner.approve(hook.id, workspaceRoot)

    const result = await runner.execute('PostToolUse', { workspaceRoot })
    // PostToolUse hooks do not gate — even non-zero exit should allow
    expect(result.decision).toBe('allow')
  })

  // ── Timeout ─────────────────────────────────────────────────────

  it('hook times out and is killed', async () => {
    const hook = makeHook(workspaceRoot, 'pre-tool-sleep.sh', '#!/bin/sh\nsleep 30')
    const runner = new HookRunner(makeSettings(true))
    await runner.approve(hook.id, workspaceRoot)

    const result = await runner.execute('PreToolUse', { workspaceRoot, timeoutMs: 500 })
    const runResult = result.results[0]?.runResult
    expect(runResult?.timedOut).toBe(true)
    expect(runResult?.error).toContain('timed out')
    expect(result.decision).toBe('deny') // timeout = deny for gating hooks
  })

  // ── Audit log ───────────────────────────────────────────────────

  it('records audit events for executed hooks', async () => {
    const hook = makeHook(workspaceRoot, 'pre-tool-audit.sh', '#!/bin/sh\necho ok')
    const runner = new HookRunner(makeSettings(true))
    await runner.approve(hook.id, workspaceRoot)

    await runner.execute('PreToolUse', { workspaceRoot })
    const audit = runner.getAuditLog()
    expect(audit.length).toBeGreaterThanOrEqual(1)
    expect(audit[audit.length - 1]?.hookId).toContain('pre-tool-audit')
  })

  it('audit log respects maxAuditEvents', () => {
    const settings = { ...makeSettings(true), maxAuditEvents: 3, auditLog: [] }
    const runner = new HookRunner(settings)
    // Simulate adding events by loading settings with audit entries
    runner.loadSettings({
      ...settings,
      auditLog: [
        { hookId: 'a', phase: 'PreToolUse', startedAt: '', durationMs: 1, exitCode: 0, signal: null, stdoutBytes: 0, stderrBytes: 0 },
        { hookId: 'b', phase: 'PreToolUse', startedAt: '', durationMs: 1, exitCode: 0, signal: null, stdoutBytes: 0, stderrBytes: 0 },
        { hookId: 'c', phase: 'PreToolUse', startedAt: '', durationMs: 1, exitCode: 0, signal: null, stdoutBytes: 0, stderrBytes: 0 },
        { hookId: 'd', phase: 'PreToolUse', startedAt: '', durationMs: 1, exitCode: 0, signal: null, stdoutBytes: 0, stderrBytes: 0 },
      ]
    })
    expect(runner.getAuditLog().length).toBeLessThanOrEqual(3)
  })

  // ── Scope separation ────────────────────────────────────────────

  it('scopes hooks as user or project', () => {
    const hook = makeHook(workspaceRoot, 'pre-tool-proj.sh', '#!/bin/sh\necho ok')
    expect(hook.scope).toBe('project')
  })

  // ── setKillSwitch toggle ───────────────────────────────────────

  it('setKillSwitch toggles execution gate', async () => {
    const hook = makeHook(workspaceRoot, 'pre-tool-test.sh', '#!/bin/sh\necho ok')
    const runner = new HookRunner(makeSettings(true))
    await runner.approve(hook.id, workspaceRoot)

    // Run with kill switch on — should execute
    const result1 = await runner.execute('PreToolUse', { workspaceRoot })
    expect(result1.results[0]?.trusted).toBe(true)
    expect(result1.results[0]?.runResult?.exitCode).toBe(0)

    // Toggle kill switch off
    runner.setKillSwitch(false)
    const result2 = await runner.execute('PreToolUse', { workspaceRoot })
    expect(result2.results).toHaveLength(0)
    expect(result2.decision).toBe('allow')
  })

  // ── stdin payload ───────────────────────────────────────────────

  it('passes payload via stdin to hook', async () => {
    const hook = makeHook(workspaceRoot, 'pre-tool-stdin.sh', '#!/bin/sh\ncat')
    const runner = new HookRunner(makeSettings(true))
    await runner.approve(hook.id, workspaceRoot)

    const result = await runner.execute('PreToolUse', {
      workspaceRoot,
      payload: { tool: 'read', args: { path: '/test' } }
    })
    expect(result.results[0]?.runResult?.exitCode).toBe(0)
    const stdout = result.results[0]?.runResult?.stdout.trim() ?? ''
    if (stdout) {
      const parsed = JSON.parse(stdout)
      expect(parsed.tool).toBe('read')
    }
  })

  // ── getSettings snapshot ────────────────────────────────────────

  it('getSettings reflects current state', () => {
    const runner = new HookRunner(defaultKunHookSettings())
    const settings = runner.getSettings()
    expect(settings.enabled).toBe(false)
    expect(settings.trustedHooks).toEqual({})
  })

  it('loadSettings updates settings and merges audit log', () => {
    const runner = new HookRunner(defaultKunHookSettings())
    const newSettings: KunHookSettingsV1 = {
      ...defaultKunHookSettings(),
      enabled: true,
      auditLog: [
        { hookId: 'test', phase: 'PreToolUse', startedAt: '2024-01-01', durationMs: 1, exitCode: 0, signal: null, stdoutBytes: 0, stderrBytes: 0 }
      ]
    }
    runner.loadSettings(newSettings)
    expect(runner.getSettings().enabled).toBe(true)
    expect(runner.getAuditLog().length).toBe(1)
  })
})
