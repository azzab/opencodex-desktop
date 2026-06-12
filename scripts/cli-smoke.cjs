#!/usr/bin/env node
/**
 * H9 CLI smoke — strict stop-gate for opencodex CLI + Kun protocol.
 *
 * GATE 1: opencodex serve starts Kun headless, opencodex send completes a
 *         streamed turn containing the required marker CLI_SMOKE_OK.
 *         HARD FAIL on: provider/auth errors, missing marker, zero-length
 *         output, or only-error streams.
 *
 * GATE 2: Approval round-trip via test fixture (insecure-only):
 *         POST /v1/_test/approvals → opencodex approve list → opencodex
 *         approve allow → confirm resolved state.
 *
 * SAFETY: cleanup only removes the mktemp directory; never rm -rf any
 * broad temp path.
 */
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const http = require('http');

const ROOT = resolve(__dirname, '..');
const DATA_DIR = mkdtempSync(join(tmpdir(), 'ocx-h9-cli-smoke-'));
const CLI_ENTRY = join(ROOT, 'clients', 'cli', 'dist', 'index.js');
const KUN_ENTRY = join(ROOT, 'kun', 'dist', 'cli', 'serve-entry.js');
const PORT = 19879;

let smokePassed = { gate1: false, gate2: false, gate3: false };

function cleanup() {
  try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch { /* noop */ }
}

/* ---------- helpers ---------- */

function httpReq(path, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`http://127.0.0.1:${PORT}${path}`, {
      method: opts.method || 'GET',
      headers: opts.headers || {},
      timeout: opts.timeout || 10000
    }, (res) => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function waitForHealth(maxRetries = 30, intervalMs = 500) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await httpReq('/health');
      if (res.status === 200) {
        console.log(`[smoke] Health OK (attempt ${i + 1})`);
        return true;
      }
    } catch { /* not ready */ }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return false;
}

async function killProcess(child, label) {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 3000));
  try { process.kill(child.pid, 0); child.kill('SIGKILL'); await new Promise(r => setTimeout(r, 1000)); } catch { /* dead */ }
}

function spawnAndCollect(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: 'pipe',
      env: { ...process.env, ...(opts.env || {}) },
      timeout: opts.timeout || 30000
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* noop */ }
      resolve({ exitCode: null, stdout, stderr, killed: true });
    }, (opts.timeout || 30000) + 5000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code, stdout, stderr, killed: false });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ exitCode: null, stdout, stderr: err.message, killed: false });
    });
  });
}

/* ---------- GATE 1: Streamed turn with marker ---------- */

async function gate1_chat_stream() {
  console.log('\n[smoke] ═══ GATE 1: opencodex serve → opencodex send streamed turn ═══');

  // Verify prerequisites
  if (!existsSync(CLI_ENTRY)) {
    console.error('[smoke] ❌ GATE 1 BLOCKED: CLI entry not found:', CLI_ENTRY);
    console.error('[smoke]    Run: cd clients/cli && npm run build');
    return false;
  }
  if (!existsSync(KUN_ENTRY)) {
    console.error('[smoke] ❌ GATE 1 BLOCKED: Kun entry not found:', KUN_ENTRY);
    console.error('[smoke]    Run: cd kun && npm run build');
    return false;
  }

  // Start Kun via opencodex serve (real thin delegate)
  console.log('[smoke] Starting Kun via opencodex serve...');
  const kunChild = spawn('node', [
    CLI_ENTRY, 'serve',
    '--port', String(PORT),
    '--data-dir', DATA_DIR,
    '--insecure',
    '--approval-policy', 'auto'
  ], {
    stdio: 'pipe',
    env: { ...process.env, KUN_DATA_DIR: DATA_DIR }
  });

  let kunStderr = '';
  kunChild.stderr.on('data', d => { kunStderr += d.toString(); });

  const healthy = await waitForHealth();
  if (!healthy) {
    console.error('[smoke] ❌ GATE 1 BLOCKED: Kun failed health check');
    console.error('[smoke]    stderr tail:', kunStderr.slice(-1000));
    await killProcess(kunChild, 'kun');
    return false;
  }
  console.log('[smoke] ✅ Kun healthy via opencodex serve');

  // Create a thread via API
  const threadRes = await httpReq('/v1/threads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'H9-smoke-gate1', workspace: DATA_DIR, model: 'deepseek-chat' })
  });

  if (threadRes.status !== 200 && threadRes.status !== 201) {
    console.error('[smoke] ❌ GATE 1 BLOCKED: Thread creation failed', threadRes.status, threadRes.body.slice(0, 300));
    await killProcess(kunChild, 'kun');
    return false;
  }

  let thread;
  try { thread = JSON.parse(threadRes.body); } catch {
    console.error('[smoke] ❌ GATE 1 BLOCKED: Thread parse error:', threadRes.body.slice(0, 200));
    await killProcess(kunChild, 'kun');
    return false;
  }
  console.log('[smoke] Thread created:', thread.id);

  // Send a turn via opencodex send
  const MARKER = 'CLI_SMOKE_OK';
  console.log(`[smoke] Running: opencodex send ${thread.id} --prompt "Reply with exactly '${MARKER}' and nothing else."`);

  const sendResult = await spawnAndCollect('node', [
    CLI_ENTRY, 'send', thread.id,
    '--prompt', `Reply with exactly '${MARKER}' and nothing else.`
  ], {
    env: {
      OPENCODEX_HOST: '127.0.0.1',
      OPENCODEX_PORT: String(PORT)
    },
    timeout: 90000
  });

  console.log('[smoke] send exitCode:', sendResult.exitCode);
  console.log('[smoke] send stdout length:', sendResult.stdout.length);
  console.log('[smoke] send stdout (first 500):', sendResult.stdout.slice(0, 500));
  if (sendResult.stderr) console.log('[smoke] send stderr (first 500):', sendResult.stderr.slice(0, 500));

  // --- STRICT PASS CRITERIA ---

  if (sendResult.killed) {
    console.error('[smoke] ❌ GATE 1 FAIL: send timed out (no response from model)');
    await killProcess(kunChild, 'kun');
    return false;
  }

  if (sendResult.stdout.length === 0) {
    console.error('[smoke] ❌ GATE 1 FAIL: zero-length output (no streamed content)');
    await killProcess(kunChild, 'kun');
    return false;
  }

  // Check for provider/auth errors in output
  const lowerOut = sendResult.stdout.toLowerCase();
  const errorIndicators = [
    'authentication', 'unauthorized', 'invalid api key', 'api key',
    'provider error', 'rate limit', 'insufficient', 'model not found',
    'deepseek api', '401', '403', '429'
  ];
  const hasProviderError = errorIndicators.some(ind => lowerOut.includes(ind));
  if (hasProviderError) {
    console.error('[smoke] ❌ GATE 1 FAIL: provider/auth error detected in output');
    console.error('[smoke]    Output:', sendResult.stdout.slice(0, 300));
    console.error('[smoke]    This is a real failure — model configuration is missing or invalid.');
    await killProcess(kunChild, 'kun');
    return false;
  }

  // Check for only-error streams (SSE error events with no text deltas)
  const hasTextDelta = sendResult.stdout.length > 30 && 
    (sendResult.stdout.includes(' ') || sendResult.stdout.includes(':'));
  if (!hasTextDelta) {
    console.error('[smoke] ❌ GATE 1 FAIL: output appears to contain only errors or no real text deltas');
    await killProcess(kunChild, 'kun');
    return false;
  }

  // MUST contain the marker
  if (!sendResult.stdout.includes(MARKER)) {
    console.error(`[smoke] ❌ GATE 1 FAIL: marker '${MARKER}' not found in output`);
    console.error('[smoke]    The model did not produce the requested marker.');
    console.error('[smoke]    Either no model is configured, or the model failed to respond.');
    await killProcess(kunChild, 'kun');
    return false;
  }

  console.log(`[smoke] ✅ GATE 1 PASSED: Streamed turn completed with marker '${MARKER}'`);
  return { kunChild, thread };
}

/* ---------- GATE 2: Approval round-trip ---------- */

async function gate2_approval_roundtrip(kunChild, thread) {
  console.log('\n[smoke] ═══ GATE 2: Approval round-trip (test fixture) ═══');

  // Create a pending approval via the test fixture
  const fixtureRes = await httpReq('/v1/_test/approvals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      threadId: thread.id,
      turnId: 'turn_test_fixture',
      toolName: 'bash',
      summary: 'H9 smoke test — run ls'
    })
  });

  if (fixtureRes.status !== 200 && fixtureRes.status !== 201) {
    console.error('[smoke] ❌ GATE 2 BLOCKED: Test fixture endpoint returned', fixtureRes.status, fixtureRes.body.slice(0, 200));
    return false;
  }

  let fixture;
  try { fixture = JSON.parse(fixtureRes.body); } catch {
    console.error('[smoke] ❌ GATE 2 BLOCKED: Fixture parse error:', fixtureRes.body.slice(0, 200));
    return false;
  }
  const approvalId = fixture.approval?.id;
  if (!approvalId) {
    console.error('[smoke] ❌ GATE 2 BLOCKED: No approval ID in fixture response');
    return false;
  }
  console.log('[smoke] Test approval created:', approvalId);

  // Step 2a: List approvals via CLI
  console.log('[smoke] Running: opencodex approve list --thread', thread.id);
  const listResult = await spawnAndCollect('node', [
    CLI_ENTRY, 'approve', 'list', '--thread', thread.id
  ], {
    env: {
      OPENCODEX_HOST: '127.0.0.1',
      OPENCODEX_PORT: String(PORT)
    },
    timeout: 15000
  });

  console.log('[smoke] approve list exit:', listResult.exitCode);
  console.log('[smoke] approve list stdout:', listResult.stdout.trim());

  if (listResult.exitCode !== 0) {
    console.error('[smoke] ❌ GATE 2 FAIL: approve list returned non-zero exit code');
    console.error('[smoke]    stderr:', listResult.stderr.slice(0, 500));
    return false;
  }

  if (!listResult.stdout.includes(approvalId)) {
    console.error(`[smoke] ❌ GATE 2 FAIL: approve list did not include approval '${approvalId}'`);
    console.error('[smoke]    Output:', listResult.stdout.trim());
    return false;
  }

  if (!listResult.stdout.includes('pending')) {
    console.error('[smoke] ❌ GATE 2 FAIL: approval not listed as pending');
    return false;
  }

  console.log('[smoke] ✅ Approval listed as pending');

  // Step 2b: Allow the approval via CLI
  console.log('[smoke] Running: opencodex approve allow', approvalId);
  const allowResult = await spawnAndCollect('node', [
    CLI_ENTRY, 'approve', 'allow', approvalId
  ], {
    env: {
      OPENCODEX_HOST: '127.0.0.1',
      OPENCODEX_PORT: String(PORT)
    },
    timeout: 15000
  });

  console.log('[smoke] approve allow exit:', allowResult.exitCode);
  console.log('[smoke] approve allow stdout:', allowResult.stdout.trim());
  if (allowResult.stderr) console.log('[smoke] approve allow stderr:', allowResult.stderr.trim());

  if (allowResult.exitCode !== 0) {
    console.error('[smoke] ❌ GATE 2 FAIL: approve allow returned non-zero exit code');
    return false;
  }

  if (!allowResult.stdout.includes('allowed') && !allowResult.stdout.includes('allow')) {
    console.error('[smoke] ❌ GATE 2 FAIL: approve allow did not confirm resolution');
    return false;
  }

  console.log('[smoke] ✅ Approval allowed via CLI');

  // Step 2c: Confirm resolution — re-list, verify not pending
  console.log('[smoke] Verifying approval is no longer pending...');
  const listResult2 = await spawnAndCollect('node', [
    CLI_ENTRY, 'approve', 'list', '--thread', thread.id
  ], {
    env: {
      OPENCODEX_HOST: '127.0.0.1',
      OPENCODEX_PORT: String(PORT)
    },
    timeout: 15000
  });

  console.log('[smoke] re-list stdout:', listResult2.stdout.trim());

  // After resolution, the gate returns `pending()` which filters on status='pending'.
  // The resolved approval should NOT appear in the list (it's no longer pending).
  if (listResult2.stdout.includes(approvalId)) {
    console.error(`[smoke] ❌ GATE 2 FAIL: Resolved approval '${approvalId}' still appears in pending list`);
    return false;
  }

  console.log('[smoke] ✅ GATE 2 PASSED: Full approval round-trip (create → list → allow → confirmed resolved)');
  return true;
}

/* ---------- GATE 3: threads, usage, health ---------- */

async function gate3_meta_commands() {
  console.log('\n[smoke] ═══ GATE 3: threads, usage, health ═══');
  let allOk = true;

  // Health
  const healthRes = await spawnAndCollect('node', [CLI_ENTRY, 'health'], {
    env: { OPENCODEX_HOST: '127.0.0.1', OPENCODEX_PORT: String(PORT) },
    timeout: 10000
  });
  if (healthRes.exitCode === 0 && healthRes.stdout.includes('"ok"')) {
    console.log('[smoke] ✅ health');
  } else {
    console.error('[smoke] ❌ health FAIL:', healthRes.exitCode, healthRes.stdout.slice(0, 200));
    allOk = false;
  }

  // Threads list
  const threadsRes = await spawnAndCollect('node', [CLI_ENTRY, 'threads', 'list'], {
    env: { OPENCODEX_HOST: '127.0.0.1', OPENCODEX_PORT: String(PORT) },
    timeout: 10000
  });
  if (threadsRes.exitCode === 0) {
    const count = threadsRes.stdout.split('\n').filter(Boolean).length;
    console.log(`[smoke] ✅ threads list (${count} threads)`);
  } else {
    console.error('[smoke] ❌ threads list FAIL:', threadsRes.exitCode);
    allOk = false;
  }

  return allOk;
}

/* ---------- main ---------- */

async function main() {
  try {
    // GATE 1: Must pass — streamed turn with marker
    const gate1Result = await gate1_chat_stream();
    if (!gate1Result) {
      cleanup();
      process.exit(1);
    }
    smokePassed.gate1 = true;

    // GATE 2: Approval round-trip via test fixture
    smokePassed.gate2 = await gate2_approval_roundtrip(gate1Result.kunChild, gate1Result.thread);

    // GATE 3: Meta commands
    smokePassed.gate3 = await gate3_meta_commands();

    // Cleanup
    await killProcess(gate1Result.kunChild, 'kun');
    cleanup();

    // Final verdict
    console.log('\n[smoke] ═══════════════════════════════════════');
    console.log('[smoke]  GATE 1 (streamed turn):  ', smokePassed.gate1 ? '✅ PASS' : '❌ FAIL');
    console.log('[smoke]  GATE 2 (approval trip):   ', smokePassed.gate2 ? '✅ PASS' : '❌ FAIL');
    console.log('[smoke]  GATE 3 (meta commands):  ', smokePassed.gate3 ? '✅ PASS' : '❌ FAIL');
    console.log('[smoke] ═══════════════════════════════════════');

    const allPassed = smokePassed.gate1 && smokePassed.gate2 && smokePassed.gate3;
    if (allPassed) {
      console.log('[smoke] 🎉 ALL GATES PASSED');
      process.exit(0);
    } else {
      console.error('[smoke] ❌ SOME GATES FAILED');
      process.exit(1);
    }
  } catch (err) {
    console.error('[smoke] Unexpected error:', err);
    cleanup();
    process.exit(1);
  }
}

main();
