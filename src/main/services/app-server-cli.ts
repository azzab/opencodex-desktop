import type {
  AppServerBridge,
  AppServerBridgeResult
} from './app-server-bridge'
import type { AppServerClientAuth } from './app-server-auth'

export type AppServerCliCommand =
  | { kind: 'health' }
  | { kind: 'projects' }
  | { kind: 'threads'; limit?: number; search?: string; includeArchived?: boolean }
  | {
      kind: 'start'
      workspaceRoot: string
      title?: string
      model?: string
      mode?: 'agent' | 'plan'
      initialPrompt?: string
    }
  | { kind: 'resume'; sessionId: string; workspaceRoot?: string; model?: string; mode?: 'agent' | 'plan' }
  | { kind: 'steer'; threadId: string; turnId: string; text: string }

export type AppServerCliParseResult =
  | { ok: true; command: AppServerCliCommand }
  | { ok: false; message: string }

export async function runAppServerCliCommand(
  bridge: AppServerBridge,
  client: AppServerClientAuth,
  argv: readonly string[]
): Promise<string> {
  const parsed = parseAppServerCliArgs(argv)
  if (!parsed.ok) {
    return JSON.stringify({ ok: false, status: 2, message: parsed.message }, null, 2)
  }

  let result: AppServerBridgeResult<unknown>
  switch (parsed.command.kind) {
    case 'health':
      result = await bridge.health(client)
      break
    case 'projects':
      result = await bridge.listProjects(client)
      break
    case 'threads':
      result = await bridge.listThreads(client, {
        limit: parsed.command.limit,
        search: parsed.command.search,
        includeArchived: parsed.command.includeArchived
      })
      break
    case 'start':
      result = await bridge.startThread(client, parsed.command)
      break
    case 'resume':
      result = await bridge.resumeThread(client, {
        sessionId: parsed.command.sessionId,
        workspaceRoot: parsed.command.workspaceRoot,
        model: parsed.command.model,
        mode: parsed.command.mode
      })
      break
    case 'steer':
      result = await bridge.steerTurn(client, parsed.command)
      break
  }
  return JSON.stringify(result, null, 2)
}

export function parseAppServerCliArgs(argv: readonly string[]): AppServerCliParseResult {
  const [command, ...rest] = argv
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    return { ok: false, message: helpText() }
  }
  const flags = parseFlags(rest)
  switch (command) {
    case 'health':
      return { ok: true, command: { kind: 'health' } }
    case 'projects':
      return { ok: true, command: { kind: 'projects' } }
    case 'threads':
      return {
        ok: true,
        command: {
          kind: 'threads',
          limit: positiveIntegerFlag(flags, 'limit'),
          search: flags.get('search'),
          includeArchived: flags.has('include-archived')
        }
      }
    case 'start': {
      const workspaceRoot = flags.get('workspace') || flags.get('workspace-root')
      if (!workspaceRoot) return { ok: false, message: 'start requires --workspace <path>.' }
      return {
        ok: true,
        command: {
          kind: 'start',
          workspaceRoot,
          title: flags.get('title'),
          model: flags.get('model'),
          mode: modeFlag(flags),
          initialPrompt: flags.get('prompt')
        }
      }
    }
    case 'resume': {
      const sessionId = flags.get('session')
      if (!sessionId) return { ok: false, message: 'resume requires --session <id>.' }
      return {
        ok: true,
        command: {
          kind: 'resume',
          sessionId,
          workspaceRoot: flags.get('workspace') || flags.get('workspace-root'),
          model: flags.get('model'),
          mode: modeFlag(flags)
        }
      }
    }
    case 'steer': {
      const threadId = flags.get('thread')
      const turnId = flags.get('turn')
      const text = flags.get('text')
      if (!threadId || !turnId || !text) {
        return { ok: false, message: 'steer requires --thread <id> --turn <id> --text <text>.' }
      }
      return { ok: true, command: { kind: 'steer', threadId, turnId, text } }
    }
    default:
      return { ok: false, message: `Unknown app-server CLI command: ${command}` }
  }
}

function parseFlags(args: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>()
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? ''
    if (!arg.startsWith('--')) continue
    const trimmed = arg.slice(2)
    const inline = trimmed.indexOf('=')
    if (inline >= 0) {
      flags.set(trimmed.slice(0, inline), trimmed.slice(inline + 1))
      continue
    }
    const next = args[index + 1]
    if (next && !next.startsWith('--')) {
      flags.set(trimmed, next)
      index += 1
    } else {
      flags.set(trimmed, 'true')
    }
  }
  return flags
}

function modeFlag(flags: Map<string, string>): 'agent' | 'plan' | undefined {
  const mode = flags.get('mode')
  return mode === 'agent' || mode === 'plan' ? mode : undefined
}

function positiveIntegerFlag(flags: Map<string, string>, key: string): number | undefined {
  const value = Number(flags.get(key) ?? '')
  return Number.isInteger(value) && value > 0 ? value : undefined
}

function helpText(): string {
  return [
    'OpenCodex app-server CLI bridge prototype',
    'Commands:',
    '  health',
    '  projects',
    '  threads [--limit N] [--search TEXT] [--include-archived]',
    '  start --workspace PATH [--title TEXT] [--model ID] [--mode agent|plan] [--prompt TEXT]',
    '  resume --session ID [--workspace PATH] [--model ID] [--mode agent|plan]',
    '  steer --thread ID --turn ID --text TEXT'
  ].join('\n')
}
