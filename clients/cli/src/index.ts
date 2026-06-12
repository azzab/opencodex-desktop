#!/usr/bin/env node
/**
 * OpenCodex CLI — thin adapter over the app-server protocol.
 * All business logic lives in Kun; this is a transport + UX shell.
 */
import process from 'node:process'
import { resolveAuthConfig, baseUrlFromAuth, isLoopbackHost } from './auth.js'
import { createFetchTransport } from './transport.js'
import { OpenCodexProtocolClient } from './client.js'
import {
  chatCommand,
  threadsCommand,
  sendCommand,
  approveCommand,
  usageCommand,
  healthCommand,
  serveCommand
} from './commands.js'

const USAGE = `opencodex <command> [options]

Commands:
  chat           Interactive turn loop with streamed events
  threads list   List recent threads
  threads show   <thread-id> Show thread details
  send           <thread-id> <prompt> Send a one-shot turn
  approve list   List pending approvals
  approve <id>   Allow or deny a pending approval
  usage          Show telemetry summary
  serve          Delegate to Kun serve (headless runtime)

Environment:
  OPENCODEX_TOKEN   Local auth token
  OPENCODEX_HOST    Server host (default: 127.0.0.1)
  OPENCODEX_PORT    Server port (default: 18999)
`

type ParsedArgs = {
  command: string
  subcommand?: string
  flags: Map<string, string>
  positionals: string[]
}

function parseArgs(argv: readonly string[]): ParsedArgs | { error: string } {
  const [command, ...rest] = argv
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    return { error: USAGE }
  }
  const flags = new Map<string, string>()
  const positionals: string[] = []
  let subcommand: string | undefined

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i] ?? ''
    if (token.startsWith('--')) {
      const eqIdx = token.indexOf('=')
      if (eqIdx >= 0) {
        flags.set(token.slice(2, eqIdx), token.slice(eqIdx + 1))
      } else {
        const next = rest[i + 1]
        if (next && !next.startsWith('--')) {
          flags.set(token.slice(2), next)
          i++
        } else {
          flags.set(token.slice(2), 'true')
        }
      }
    } else if (!subcommand && ['list', 'show', 'allow', 'deny'].includes(token)) {
      subcommand = token
    } else {
      positionals.push(token)
    }
  }

  return { command, subcommand, flags, positionals }
}

async function main(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv)
  if ('error' in parsed) {
    process.stdout.write(parsed.error)
    return parsed.error === USAGE ? 0 : 1
  }

  const auth = resolveAuthConfig(process.env)
  if (auth.loopbackOnly && !isLoopbackHost(auth.host)) {
    process.stderr.write('Error: loopback host required. Set OPENCODEX_HOST to 127.0.0.1 or localhost.\n')
    return 1
  }

  const baseUrl = baseUrlFromAuth(auth)
  const transport = createFetchTransport(baseUrl, auth.token)
  const client = new OpenCodexProtocolClient(transport)
  const io = { stdout: process.stdout, stderr: process.stderr, stdin: process.stdin, exit: process.exit.bind(process) }

  const { command, subcommand, flags, positionals } = parsed

  switch (command) {
    case 'chat':
      return chatCommand(client, {
        workspace: flags.get('workspace') ?? flags.get('project'),
        model: flags.get('model'),
        title: flags.get('title'),
        mode: flags.get('mode') === 'plan' ? 'plan' : 'agent'
      }, io)

    case 'threads':
      if (subcommand === 'show') {
        const showId = flags.get('id') ?? positionals[0] ?? flags.get('thread')
        if (!showId) {
          process.stderr.write('Error: threads show requires <thread-id> or --id <thread-id>\n')
          return 1
        }
        return threadsCommand(client, { showId }, io)
      }
      return threadsCommand(client, {
        list: true,
        limit: Number(flags.get('limit') ?? '20'),
        search: flags.get('search')
      }, io)

    case 'send': {
      const threadId = flags.get('thread') ?? positionals[0]
      const prompt = flags.get('prompt') ?? positionals.slice(1).join(' ')
      if (!threadId || !prompt) {
        process.stderr.write('Error: send <thread-id> <prompt> required\n')
        return 1
      }
      return sendCommand(client, {
        threadId,
        prompt,
        mode: flags.get('mode') === 'plan' ? 'plan' : 'agent'
      }, io)
    }

    case 'approve':
      if (subcommand === 'list' || (!subcommand && positionals.length === 0)) {
        const listThreadId = flags.get('thread') ?? flags.get('threadId')
        return approveCommand(client, { list: true, threadId: listThreadId }, io)
      }
      if (subcommand === 'allow' || subcommand === 'deny') {
        const approvalId = flags.get('id') ?? positionals[0]
        if (!approvalId) {
          process.stderr.write('Error: approve allow/deny requires an approval ID\n')
          return 1
        }
        return approveCommand(client, { id: approvalId, action: subcommand }, io)
      }
      process.stderr.write('Error: approve requires list, allow, or deny subcommand\n')
      return 1

    case 'usage':
      return usageCommand(client, {
        threadId: flags.get('thread') ?? positionals[0]
      }, io)

    case 'health':
      return healthCommand(client, io)

    case 'serve':
      return serveCommand(argv.slice(1), io)

    default:
      process.stderr.write(`Unknown command: ${command}\nRun 'opencodex help' for usage.\n`)
      return 1
  }
}

main(process.argv.slice(2)).then(
  (code) => { process.exit(code) },
  (error) => {
    process.stderr.write(`opencodex: ${String(error)}\n`)
    process.exit(1)
  }
)
