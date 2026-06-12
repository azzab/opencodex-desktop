/**
 * CLI command handlers. Thin adapters: parse argv → call protocol client → format output.
 */
import type { Interface } from 'node:readline/promises'
import { createInterface } from 'node:readline/promises'
import type { OpenCodexProtocolClient, SseEvent } from './client.js'
import { streamSseEvents } from './client.js'

export type CliIo = {
  stdout: { write(chunk: string): unknown }
  stderr: { write(chunk: string): unknown }
  stdin?: NodeJS.ReadableStream
  exit(code: number): never
}

/* ------------------------------------------------------------------ */
/*  chat — interactive turn loop with streamed events                  */
/* ------------------------------------------------------------------ */

export async function chatCommand(
  client: OpenCodexProtocolClient,
  args: {
    workspace?: string
    model?: string
    title?: string
    mode?: 'agent' | 'plan'
  },
  io: CliIo
): Promise<number> {
  const workspace = args.workspace ?? process.cwd()
  io.stderr.write(`Starting chat in ${workspace}\n`)

  const start = await client.startThread({
    workspaceRoot: workspace,
    title: args.title ?? 'CLI chat',
    model: args.model,
    mode: args.mode ?? 'agent'
  })
  if (!start.ok) {
    io.stderr.write(`Failed to create thread: ${start.message}\n`)
    return 1
  }

  const threadId = start.value.thread.id
  io.stderr.write(`Thread: ${threadId}\n`)
  io.stderr.write(`Commands: /exit /quit\n\n`)

  const input = io.stdin ?? process.stdin
  const rl = createInterface({
    input,
    output: process.stdout,
    terminal: isTty(input as NodeJS.ReadStream)
  })

  try {
    for (;;) {
      const raw = await safeQuestion(rl, '> ')
      if (raw === null) break
      const prompt = raw.trim()
      if (!prompt) continue
      if (prompt === '/exit' || prompt === '/quit') break

      const turnResult = await client.sendTurn(threadId, prompt, args.mode)
      if (!turnResult.ok) {
        io.stderr.write(`Error sending turn: ${turnResult.message}\n`)
        continue
      }
      io.stderr.write(`Turn ${turnResult.value.id} running...\n`)

      const streamResult = await client.streamThreadEvents(threadId)
      if (!streamResult.ok) {
        io.stderr.write(`Stream error: ${streamResult.message}\n`)
        continue
      }

      let lastPrinted = ''
      for await (const event of streamSseEvents(streamResult.value)) {
        const printed = formatStreamEvent(event)
        if (printed && printed !== lastPrinted) {
          io.stdout.write(printed)
          lastPrinted = printed
        }
        if (isTerminalSseEvent(event)) break
      }
      io.stdout.write('\n')
    }
  } finally {
    rl.close()
  }
  return 0
}

/* ------------------------------------------------------------------ */
/*  threads — list or show                                              */
/* ------------------------------------------------------------------ */

export async function threadsCommand(
  client: OpenCodexProtocolClient,
  args: { list?: boolean; showId?: string; limit?: number; search?: string },
  io: CliIo
): Promise<number> {
  if (args.showId) {
    const result = await client.getThread(args.showId)
    if (!result.ok) {
      io.stderr.write(`Thread not found: ${result.message}\n`)
      return 1
    }
    io.stdout.write(formatThread(result.value) + '\n')
    return 0
  }

  const result = await client.listThreads({
    limit: args.limit ?? 20,
    search: args.search
  })
  if (!result.ok) {
    io.stderr.write(`Failed to list threads: ${result.message}\n`)
    return 1
  }

  if (result.value.length === 0) {
    io.stdout.write('No threads found.\n')
    return 0
  }

  for (const thread of result.value) {
    io.stdout.write(`${thread.id}  ${thread.status.padEnd(10)} ${thread.title}  ${thread.mode}\n`)
  }
  return 0
}

/* ------------------------------------------------------------------ */
/*  send — one-shot prompt to existing thread                          */
/* ------------------------------------------------------------------ */

export async function sendCommand(
  client: OpenCodexProtocolClient,
  args: { threadId: string; prompt: string; mode?: 'agent' | 'plan' },
  io: CliIo
): Promise<number> {
  const result = await client.sendTurn(args.threadId, args.prompt, args.mode)
  if (!result.ok) {
    io.stderr.write(`Failed to send: ${result.message}\n`)
    return 1
  }
  io.stdout.write(`Turn ${result.value.id} queued on thread ${args.threadId}\n`)

  const streamResult = await client.streamThreadEvents(args.threadId)
  if (!streamResult.ok) {
    io.stderr.write(`Stream unavailable: ${streamResult.message}\n`)
    return 0
  }

  for await (const event of streamSseEvents(streamResult.value)) {
    const printed = formatStreamEvent(event)
    if (printed) io.stdout.write(printed)
    if (isTerminalSseEvent(event)) break
  }
  io.stdout.write('\n')
  return 0
}

/* ------------------------------------------------------------------ */
/*  approve/deny — list and respond to pending approvals                */
/* ------------------------------------------------------------------ */

export async function approveCommand(
  client: OpenCodexProtocolClient,
  args: { list?: boolean; id?: string; action?: 'allow' | 'deny'; threadId?: string },
  io: CliIo
): Promise<number> {
  if (args.id && args.action) {
    const result = await client.respondApproval(args.id, args.action)
    if (!result.ok) {
      io.stderr.write(`Failed: ${result.message}\n`)
      return 1
    }
    io.stdout.write(`Approval ${args.id}: ${args.action}ed\n`)
    return 0
  }

  const result = await client.listApprovals(args.threadId)
  if (!result.ok) {
    io.stderr.write(`Failed to list approvals: ${result.message}\n`)
    return 1
  }

  if (result.value.length === 0) {
    io.stdout.write('No pending approvals.\n')
    return 0
  }

  for (const approval of result.value) {
    io.stdout.write(`${approval.id}  [${approval.status}] ${approval.toolName} — ${approval.summary}\n`)
  }
  return 0
}

/* ------------------------------------------------------------------ */
/*  usage — telemetry summary                                          */
/* ------------------------------------------------------------------ */

export async function usageCommand(
  client: OpenCodexProtocolClient,
  args: { threadId?: string },
  io: CliIo
): Promise<number> {
  const result = await client.getUsage(args.threadId)
  if (!result.ok) {
    io.stderr.write(`Failed: ${result.message}\n`)
    return 1
  }
  const u = result.value
  io.stdout.write(`Input tokens:     ${u.inputTokens.toLocaleString()}\n`)
  io.stdout.write(`Output tokens:    ${u.outputTokens.toLocaleString()}\n`)
  io.stdout.write(`Reasoning tokens: ${u.reasoningTokens.toLocaleString()}\n`)
  io.stdout.write(`Cached tokens:    ${u.cachedTokens.toLocaleString()}\n`)
  io.stdout.write(`Total tokens:     ${u.totalTokens.toLocaleString()}\n`)
  if (u.costUsd !== null) {
    io.stdout.write(`Cost (USD):       $${u.costUsd.toFixed(6)}\n`)
  }
  if (u.cacheHitRate !== null) {
    io.stdout.write(`Cache hit rate:   ${(u.cacheHitRate * 100).toFixed(1)}%\n`)
  }
  return 0
}

/* ------------------------------------------------------------------ */
/*  health                                                              */
/* ------------------------------------------------------------------ */

export async function healthCommand(
  client: OpenCodexProtocolClient,
  io: CliIo
): Promise<number> {
  const result = await client.health()
  if (!result.ok) {
    io.stderr.write(`Server unreachable: ${result.message}\n`)
    return 1
  }
  io.stdout.write(JSON.stringify(result.value, null, 2) + '\n')
  return 0
}

/* ------------------------------------------------------------------ */
/*  serve — thin delegate: starts/reuses the Kun headless serve path    */
/* ------------------------------------------------------------------ */

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function findKunServeEntry(): string | null {
  // Resolve relative to this CLI package, then fall back to workspace root
  const candidates = [
    resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..', 'kun', 'dist', 'cli', 'serve-entry.js'),
    resolve(process.cwd(), 'kun', 'dist', 'cli', 'serve-entry.js')
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

export async function serveCommand(args: readonly string[], io: CliIo): Promise<number> {
  const entry = findKunServeEntry()
  if (!entry) {
    io.stderr.write('opencodex serve: Kun runtime not found. Run "cd kun && npm run build" first.\n')
    return 1
  }

  // Forward all args to kun serve, prepending 'serve' subcommand if not present
  const kunArgs = args[0] === 'serve' ? args.slice(1) : args
  const spawnArgs = [entry, 'serve', ...kunArgs]

  io.stderr.write(`opencodex serve → kun serve ${kunArgs.join(' ')}\n`)

  const child: ChildProcess = spawn(process.execPath, spawnArgs, {
    stdio: 'inherit',
    env: { ...process.env }
  })

  // Proxy signals
  const onSignal = (signal: NodeJS.Signals) => {
    if (child.pid) {
      try { process.kill(child.pid, signal) } catch { /* gone */ }
    }
  }
  process.once('SIGTERM', onSignal)
  process.once('SIGINT', onSignal)

  return new Promise<number>((resolve) => {
    child.on('exit', (code, sig) => {
      process.removeListener('SIGTERM', onSignal)
      process.removeListener('SIGINT', onSignal)
      if (sig) {
        io.stderr.write(`opencodex serve: kun exited with signal ${sig}\n`)
        const sigNum: Record<string, number> = { SIGTERM: 15, SIGINT: 2, SIGKILL: 9 }
        resolve(128 + (sigNum[sig] ?? 0))
      } else {
        resolve(code ?? 0)
      }
    })
    child.on('error', (err) => {
      process.removeListener('SIGTERM', onSignal)
      process.removeListener('SIGINT', onSignal)
      io.stderr.write(`opencodex serve: failed to start kun: ${err.message}\n`)
      resolve(1)
    })
  })
}

/* ------------------------------------------------------------------ */
/*  SSE terminal detection                                              */
/* ------------------------------------------------------------------ */

function isTerminalSseEvent(event: SseEvent): boolean {
  try {
    const parsed = JSON.parse(event.data) as Record<string, unknown>
    const kind = parsed.kind ?? parsed.type ?? event.event ?? ''
    const status = parsed.status
    if (kind === 'turn_completed' || kind === 'done' || kind === 'completed') return true
    if (kind === 'turn_failed' || kind === 'turn_aborted' || kind === 'error') return true
    if (status === 'completed' || status === 'failed' || status === 'error' || status === 'aborted') return true
  } catch { /* ignore parse errors */ }
  return false
}

/* ------------------------------------------------------------------ */
/*  Output formatters                                                   */
/* ------------------------------------------------------------------ */

function formatThread(t: {
  id: string
  title: string
  workspaceRoot: string
  model: string
  mode: string
  status: string
  createdAt: string
}): string {
  return [
    `ID:        ${t.id}`,
    `Title:     ${t.title}`,
    `Workspace: ${t.workspaceRoot}`,
    `Model:     ${t.model}`,
    `Mode:      ${t.mode}`,
    `Status:    ${t.status}`,
    `Created:   ${t.createdAt}`
  ].join('\n')
}

function formatStreamEvent(event: SseEvent): string | null {
  try {
    const parsed = JSON.parse(event.data) as Record<string, unknown>
    const kind = parsed.kind ?? parsed.type ?? event.event ?? ''
    const item = parsed.item as Record<string, unknown> | undefined

    if (kind === 'assistant_text_delta' || kind === 'text') {
      return String(item?.text ?? parsed.text ?? parsed.delta ?? '')
    }
    if (kind === 'assistant_reasoning_delta') {
      return `[Reasoning: ${String(item?.text ?? '').slice(0, 120)}] `
    }
    if (kind === 'turn_completed' || kind === 'done' || kind === 'completed') {
      return '\n'
    }
    if (kind === 'turn_failed') {
      const msg = parsed.message ? `: ${String(parsed.message)}` : ''
      return `\n[Turn failed${msg}]\n`
    }
    if (kind === 'tool_call_ready' || kind === 'tool_call') {
      return `\n[Tool: ${String(parsed.toolName ?? parsed.name ?? '')}] `
    }
    if (kind === 'approval_requested' || kind === 'approval_resolved' || kind === 'approval' || kind === 'approval_required') {
      const approvalId = String(parsed.approvalId ?? parsed.id ?? '')
      const summary = String(parsed.summary ?? '')
      const status = String(parsed.status ?? '')
      return `\n[APPROVAL ${approvalId}: ${status} — ${summary}] `
    }
    if (kind === 'error') {
      return `\n[Error: ${String(parsed.message ?? '')}] `
    }
    return null
  } catch {
    return null
  }
}

function isTty(stream: NodeJS.ReadStream): boolean {
  return Boolean(stream.isTTY)
}

async function safeQuestion(rl: Interface, query: string): Promise<string | null> {
  try {
    return await rl.question(query)
  } catch (error) {
    if (error instanceof Error && error.message === 'readline was closed') {
      return null
    }
    throw error
  }
}
