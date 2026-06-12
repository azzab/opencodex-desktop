#!/usr/bin/env node
/**
 * H3.5 Kun runtime smoke — starts managed Kun, verifies health endpoint,
 * creates a thread, sends a turn, and validates SSE streaming via the
 * /v1/threads/{id}/events endpoint (the actual SSE source).
 *
 * NOTE: The turn POST returns JSON (202 accepted). SSE events are delivered
 * on GET /v1/threads/{id}/events?since_seq=0 (Accept: text/event-stream).
 */
const { spawn } = require('node:child_process')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const http = require('http')

const root = resolve(__dirname, '..')
const dataDir = mkdtempSync(join(tmpdir(), 'opencodex-kun-smoke-'))

function cleanup() {
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* ignore cleanup errors */ }
}

function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 10000
    }, (res) => {
      let body = ''
      res.on('data', d => body += d)
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    if (options.body) req.write(options.body)
    req.end()
  })
}

async function waitForHealth(port, maxRetries = 20, intervalMs = 500) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`)
      if (res.status === 200) {
        console.log(`[kun-smoke] Health check passed (attempt ${i + 1})`)
        return true
      }
    } catch { /* health check not ready yet */ }
    await new Promise(r => setTimeout(r, intervalMs))
  }
  return false
}

async function main() {
  const port = 19877
  const kunEntry = join(root, 'kun', 'dist', 'cli', 'serve-entry.js')
  const { existsSync } = require('node:fs')

  if (!existsSync(kunEntry)) {
    console.error('[kun-smoke] Kun entry not found:', kunEntry)
    process.exit(1)
  }

  console.log('[kun-smoke] Starting Kun runtime on port', port)
  console.log('[kun-smoke] Data dir:', dataDir)

  const child = spawn('node', [kunEntry, '--port', String(port), '--data-dir', dataDir, '--insecure'], {
    stdio: 'pipe',
    env: { ...process.env }
  })

  let stdout = ''
  let stderr = ''
  child.stdout.on('data', d => { stdout += d.toString() })
  child.stderr.on('data', d => { stderr += d.toString() })

  // Wait for health
  const healthy = await waitForHealth(port, 30, 500)
  if (!healthy) {
    console.error('[kun-smoke] Kun failed to become healthy')
    console.error('[kun-smoke] stderr tail:', stderr.slice(-2000))
    child.kill()
    cleanup()
    process.exit(1)
  }

  console.log('[kun-smoke] ✅ Kun runtime started and healthy')

  // Create a thread
  console.log('[kun-smoke] Creating a thread...')
  let threadRes
  try {
    threadRes = await fetch(`http://127.0.0.1:${port}/v1/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'H3.5-smoke-test', workspace: dataDir, model: 'deepseek-chat' })
    })
    console.log('[kun-smoke] Thread create status:', threadRes.status)
  } catch (err) {
    console.error('[kun-smoke] Thread creation failed:', err.message)
    child.kill()
    cleanup()
    process.exit(1)
  }

  if (threadRes.status !== 200 && threadRes.status !== 201) {
    console.error('[kun-smoke] ❌ Unexpected thread create status:', threadRes.status)
    child.kill()
    cleanup()
    process.exit(1)
  }

  let thread
  try {
    thread = JSON.parse(threadRes.body)
  } catch {
    console.error('[kun-smoke] Could not parse thread response:', threadRes.body.slice(0, 200))
    child.kill()
    cleanup()
    process.exit(1)
  }

  console.log('[kun-smoke] ✅ Thread created:', thread.id)

  // 1) POST the turn — this returns JSON (202 accepted), NOT SSE
  console.log('[kun-smoke] Sending turn (expecting JSON 202)...')
  const turnBody = JSON.stringify({
    prompt: 'Reply with exactly "H3.5 SMOKE OK" and nothing else.',
    model: 'deepseek-chat',
    stream: true
  })

  let turnRes
  try {
    turnRes = await fetch(`http://127.0.0.1:${port}/v1/threads/${encodeURIComponent(thread.id)}/turns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: turnBody,
      timeout: 30000
    })
  } catch (err) {
    console.error('[kun-smoke] Turn POST failed:', err.message)
    child.kill()
    cleanup()
    process.exit(1)
  }

  console.log('[kun-smoke] Turn response status:', turnRes.status)
  console.log('[kun-smoke] Content-Type:', turnRes.headers['content-type'])

  if (turnRes.status !== 200 && turnRes.status !== 202) {
    console.error('[kun-smoke] ❌ Turn POST failed with status:', turnRes.status)
    console.error('[kun-smoke] Body:', turnRes.body.slice(0, 500))
    child.kill()
    cleanup()
    process.exit(1)
  }

  let turnData
  try {
    turnData = JSON.parse(turnRes.body)
    console.log('[kun-smoke] ✅ Turn accepted — turnId:', turnData.turnId, 'threadId:', turnData.threadId)
  } catch {
    console.error('[kun-smoke] ❌ Turn response not valid JSON:', turnRes.body.slice(0, 200))
    child.kill()
    cleanup()
    process.exit(1)
  }

  // 2) SSE stop gate — connect to the events endpoint, which IS the SSE stream
  console.log('[kun-smoke] Connecting to SSE events endpoint...')
  const sseResult = await new Promise((resolve, reject) => {
    const req = http.request(
      `http://127.0.0.1:${port}/v1/threads/${encodeURIComponent(thread.id)}/events?since_seq=0`,
      {
        method: 'GET',
        headers: { 'Accept': 'text/event-stream' },
        timeout: 60000
      },
      (res) => {
        const contentType = (res.headers['content-type'] || '').toLowerCase()
        console.log('[kun-smoke] Events endpoint status:', res.statusCode)
        console.log('[kun-smoke] Events Content-Type:', res.headers['content-type'])

        if (!contentType.includes('text/event-stream')) {
          let body = ''
          res.on('data', d => body += d)
          res.on('end', () => resolve({
            ok: false,
            reason: `Expected text/event-stream, got ${res.headers['content-type']}`,
            status: res.statusCode,
            body: body.slice(0, 500)
          }))
          return
        }

        let events = 0
        let hasSmokeMarker = false
        let body = ''
        let partial = ''
        const timeout = setTimeout(() => {
          resolve({
            ok: events > 0,
            reason: events === 0 ? 'No SSE events received before timeout' : 'Partial SSE — timed out before completion marker',
            sseEvents: events,
            hasSmokeMarker,
            body: body.slice(0, 500)
          })
        }, 45000)

        res.on('data', (chunk) => {
          const text = chunk.toString()
          body += text
          const combined = partial + text
          const blocks = combined.split(/\n\n/)
          partial = blocks.pop() || ''
          const completeBlocks = blocks.filter(b => /^data:/m.test(b))
          events += completeBlocks.length

          for (const block of completeBlocks) {
            if (block.includes('H3.5 SMOKE OK') || block.includes('H3.5 SMOKE')) {
              hasSmokeMarker = true
            }
            // Check for completed/error status in event data
            if (block.includes('"status":"completed"') || block.includes('"kind":"turn_completed"')) {
              clearTimeout(timeout)
              resolve({
                ok: true,
                sseEvents: events,
                hasSmokeMarker,
                status: res.statusCode,
                body: body.slice(0, 500)
              })
              return
            }
            if (block.includes('"status":"error"') || block.includes('"kind":"turn_failed"')) {
              clearTimeout(timeout)
              resolve({
                ok: false,
                reason: 'Turn errored: ' + block.slice(0, 200),
                sseEvents: events,
                hasSmokeMarker
              })
              return
            }
          }
        })

        res.on('end', () => {
          clearTimeout(timeout)
          resolve({
            ok: events > 0,
            reason: events === 0 ? 'No SSE events — stream ended immediately' : undefined,
            sseEvents: events,
            hasSmokeMarker,
            body: body.slice(0, 500)
          })
        })

        res.on('error', (err) => {
          clearTimeout(timeout)
          reject(err)
        })
      }
    )
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Events request timeout')) })
    req.end()
  })

  console.log('[kun-smoke] SSE result:', JSON.stringify({
    ok: sseResult.ok,
    sseEvents: sseResult.sseEvents,
    hasSmokeMarker: sseResult.hasSmokeMarker
  }))

  if (!sseResult.ok) {
    console.error('[kun-smoke] ❌ SSE GATE BLOCKED:', sseResult.reason || 'Unknown failure')
    child.kill()
    cleanup()
    process.exit(1)
  }

  if (sseResult.sseEvents === 0) {
    console.error('[kun-smoke] ❌ SSE GATE BLOCKED: Zero SSE events on events endpoint')
    child.kill()
    cleanup()
    process.exit(1)
  }

  console.log('[kun-smoke] ✅ SSE gate passed —', sseResult.sseEvents, 'SSE events received')

  // Clean shutdown — SIGTERM, wait, then force if needed
  child.kill('SIGTERM')
  await new Promise(r => setTimeout(r, 3000))
  try {
    process.kill(child.pid, 0)
    child.kill('SIGKILL')
    await new Promise(r => setTimeout(r, 1000))
  } catch {
    /* already gone */
  }
  console.log('[kun-smoke] ✅ Kun process reaped')

  cleanup()
  console.log('[kun-smoke] === ALL KUN SMOKE CHECKS PASSED ===')
  process.exit(0)
}

main().catch((err) => {
  console.error('[kun-smoke] Unexpected error:', err)
  cleanup()
  process.exit(1)
})
