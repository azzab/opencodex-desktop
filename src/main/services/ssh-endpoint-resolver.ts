/**
 * SSH Endpoint Resolver — resolves endpoint references from
 * `agents.kun.remoteRunners.hosts[].endpointRef` into concrete
 * host/port/user tuples. Never stores or exposes raw secrets.
 *
 * Supported forms:
 * - `ssh-config:<alias>` — resolves host/port/user from ~/.ssh/config
 * - `host:port` or `user@host:port` — explicit direct reference
 * - bare `host` — uses default port 22
 */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface ResolvedSshEndpoint {
  host: string
  port: number
  username?: string
}

/**
 * Parse the user's ~/.ssh/config into a map of Host alias → params.
 * Extremely minimal parser — supports only the subset we need:
 * Host, HostName, Port, User.
 */
function parseSshConfig(configPath: string): Map<string, ResolvedSshEndpoint> {
  const hosts = new Map<string, ResolvedSshEndpoint>()
  let currentAliases: string[] = []
  let currentEndpoint: ResolvedSshEndpoint = { host: '', port: 22 }

  function flushCurrent(): void {
    if (currentAliases.length > 0 && currentEndpoint.host) {
      for (const alias of currentAliases) {
        hosts.set(alias, { ...currentEndpoint })
      }
    }
    currentAliases = []
    currentEndpoint = { host: '', port: 22 }
  }

  try {
    const content = readFileSync(configPath, 'utf8')
    const lines = content.split(/\r?\n/)
    for (const rawLine of lines) {
      const line = rawLine.trim()
      // Skip comments and blanks
      if (!line || line.startsWith('#')) continue

      // Match Host directive
      const hostMatch = line.match(/^Host\s+(.+)/i)
      if (hostMatch) {
        flushCurrent()
        currentAliases = hostMatch[1]!.split(/\s+/).filter(Boolean)
        continue
      }

      const hostnameMatch = line.match(/^HostName\s+(.+)/i)
      if (hostnameMatch) {
        currentEndpoint.host = hostnameMatch[1]!.trim()
        continue
      }

      const portMatch = line.match(/^Port\s+(\d+)/i)
      if (portMatch) {
        currentEndpoint.port = parseInt(portMatch[1]!, 10) || 22
        continue
      }

      const userMatch = line.match(/^User\s+(.+)/i)
      if (userMatch) {
        currentEndpoint.username = userMatch[1]!.trim()
        continue
      }
    }
    flushCurrent()
  } catch {
    // If ~/.ssh/config doesn't exist or is unreadable, return empty map
  }

  return hosts
}

let _cachedSshConfig: Map<string, ResolvedSshEndpoint> | null = null

function getSshConfig(): Map<string, ResolvedSshEndpoint> {
  if (_cachedSshConfig) return _cachedSshConfig
  const configPath = join(homedir(), '.ssh', 'config')
  _cachedSshConfig = parseSshConfig(configPath)
  return _cachedSshConfig
}

/** Clear SSH config cache (for testing). */
export function clearSshConfigCache(): void {
  _cachedSshConfig = null
}

/**
 * Resolve an endpointRef into a concrete {host, port, username} tuple.
 *
 * Forms:
 * - `ssh-config:<alias>` — looks up ~/.ssh/config Host <alias>
 * - `user@host:port` — explicit user, host, port
 * - `host:port` — explicit host and port
 * - bare string — treated as hostname with port 22
 */
export function resolveSshEndpoint(endpointRef: string): ResolvedSshEndpoint {
  const trimmed = endpointRef.trim()
  if (!trimmed) {
    throw new Error('SSH endpointRef is empty')
  }

  // Form: ssh-config:<alias>
  if (trimmed.startsWith('ssh-config:')) {
    const alias = trimmed.slice('ssh-config:'.length).trim()
    if (!alias) throw new Error('SSH config alias is empty')
    const sshConfig = getSshConfig()
    const resolved = sshConfig.get(alias)
    if (!resolved) {
      throw new Error(`SSH config alias "${alias}" not found in ~/.ssh/config`)
    }
    // Return a clone — never expose the mutable cache entry
    return { ...resolved }
  }

  // Form: user@host:port or host:port
  const userHostPortMatch = trimmed.match(
    /^(?:([^@]+)@)?([^:]+)(?::(\d+))?$/
  )
  if (userHostPortMatch) {
    const username = userHostPortMatch[1]?.trim() || undefined
    const host = userHostPortMatch[2]!.trim()
    const port = userHostPortMatch[3] ? parseInt(userHostPortMatch[3], 10) : 22
    if (!host) throw new Error('SSH host is empty')
    if (port < 1 || port > 65535) throw new Error(`SSH port ${port} is out of range`)
    return { host, port, username }
  }

  // Bare hostname
  if (/^[a-zA-Z0-9][-a-zA-Z0-9.]*[a-zA-Z0-9]$/.test(trimmed) || /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed)) {
    return { host: trimmed, port: 22 }
  }

  throw new Error(`Cannot parse SSH endpointRef: "${trimmed}"`)
}

/**
 * Resolve endpoint from the host config, preferring explicit fields
 * if they exist, otherwise falling back to endpointRef resolution.
 */
export function resolveHostEndpoint(config: {
  endpointRef: string
  host?: string
  port?: number
  username?: string
  usernameRef?: string
}): ResolvedSshEndpoint {
  // If explicit host is provided, use it directly
  if (config.host) {
    return {
      host: config.host,
      port: config.port ?? 22,
      username: config.username ?? config.usernameRef
    }
  }

  // Otherwise resolve from endpointRef
  return resolveSshEndpoint(config.endpointRef)
}
