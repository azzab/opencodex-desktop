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
  | { kind: 'remote-status' }
  | { kind: 'remote-action'; hostId: string; action: 'connect' | 'disconnect' | 'reconnect' | 'handshake' }
  | { kind: 'remote-trust'; hostId: string; action: 'trust' | 'revoke'; path: string; label?: string }
  | { kind: 'remote-exec'; hostId: string; command: string; cwd?: string; timeoutMs?: number; maxOutputBytes?: number }
  | { kind: 'remote-stop'; hostId: string }
  | { kind: 'remote-resume'; hostId: string }
  | { kind: 'remote-audit'; limit?: number }

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
    case 'remote-status':
      result = await bridge.remoteRunnerStatus(client)
      break
    case 'remote-action':
      result = await bridge.remoteRunnerAction(client, {
        hostId: parsed.command.hostId,
        action: parsed.command.action
      })
      break
    case 'remote-trust':
      result = await bridge.remoteRunnerTrust(client, {
        hostId: parsed.command.hostId,
        action: parsed.command.action,
        path: parsed.command.path,
        label: parsed.command.label
      })
      break
    case 'remote-exec':
      result = await bridge.remoteRunnerExec(client, {
        hostId: parsed.command.hostId,
        command: parsed.command.command,
        cwd: parsed.command.cwd,
        timeoutMs: parsed.command.timeoutMs,
        maxOutputBytes: parsed.command.maxOutputBytes
      })
      break
    case 'remote-stop':
      result = await bridge.remoteRunnerStop(client, {
        hostId: parsed.command.hostId
      })
      break
    case 'remote-resume':
      result = await bridge.remoteRunnerResume(client, {
        hostId: parsed.command.hostId
      })
      break
    case 'remote-audit':
      result = await bridge.remoteRunnerAuditLog(client, {
        limit: parsed.command.limit
      })
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
    case 'remote-status':
      return { ok: true, command: { kind: 'remote-status' } }
    case 'remote-action': {
      const actionHostId = flags.get('host')
      const action = flags.get('action') as 'connect' | 'disconnect' | 'reconnect' | 'handshake' | undefined
      if (!actionHostId || !action) {
        return { ok: false, message: 'remote-action requires --host <id> --action <connect|disconnect|reconnect|handshake>.' }
      }
      if (!['connect', 'disconnect', 'reconnect', 'handshake'].includes(action)) {
        return { ok: false, message: 'remote-action --action must be connect, disconnect, reconnect, or handshake.' }
      }
      return { ok: true, command: { kind: 'remote-action', hostId: actionHostId, action } }
    }
    case 'remote-trust': {
      const trustHostId = flags.get('host')
      const trustAction = flags.get('action') as 'trust' | 'revoke' | undefined
      const trustPath = flags.get('path')
      if (!trustHostId || !trustAction || !trustPath) {
        return { ok: false, message: 'remote-trust requires --host <id> --action <trust|revoke> --path <path>.' }
      }
      if (trustAction !== 'trust' && trustAction !== 'revoke') {
        return { ok: false, message: 'remote-trust --action must be trust or revoke.' }
      }
      return {
        ok: true,
        command: {
          kind: 'remote-trust',
          hostId: trustHostId,
          action: trustAction,
          path: trustPath,
          label: flags.get('label')
        }
      }
    }
    case 'remote-exec': {
      const execHostId = flags.get('host')
      const execCommand = flags.get('command') || flags.get('cmd')
      if (!execHostId || !execCommand) {
        return { ok: false, message: 'remote-exec requires --host <id> --command <command>.' }
      }
      return {
        ok: true,
        command: {
          kind: 'remote-exec',
          hostId: execHostId,
          command: execCommand,
          cwd: flags.get('cwd'),
          timeoutMs: positiveIntegerFlag(flags, 'timeout-ms'),
          maxOutputBytes: positiveIntegerFlag(flags, 'max-output-bytes')
        }
      }
    }
    case 'remote-stop': {
      const stopHostId = flags.get('host')
      if (!stopHostId) {
        return { ok: false, message: 'remote-stop requires --host <id>.' }
      }
      return { ok: true, command: { kind: 'remote-stop', hostId: stopHostId } }
    }
    case 'remote-resume': {
      const resumeHostId = flags.get('host')
      if (!resumeHostId) {
        return { ok: false, message: 'remote-resume requires --host <id>.' }
      }
      return { ok: true, command: { kind: 'remote-resume', hostId: resumeHostId } }
    }
    case 'remote-audit':
      return {
        ok: true,
        command: {
          kind: 'remote-audit',
          limit: positiveIntegerFlag(flags, 'limit')
        }
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
    '  steer --thread ID --turn ID --text TEXT',
    '  remote-status',
    '  remote-action --host ID --action connect|disconnect|reconnect|handshake',
    '  remote-trust --host ID --action trust|revoke --path PATH [--label TEXT]',
    '  remote-exec --host ID --command CMD [--cwd PATH] [--timeout-ms N] [--max-output-bytes N]',
    '  remote-stop --host ID',
    '  remote-resume --host ID',
    '  remote-audit [--limit N]'
  ].join('\n')
}
