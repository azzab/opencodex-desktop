import { createSecureServer, type Http2SecureServer, type IncomingHttpHeaders, type OutgoingHttpHeaders } from 'node:http2'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { networkInterfaces } from 'node:os'
import type { MobilePairingService } from './mobile-pairing-service'
import type { MobileAccessAuditEventV1, MobileAccessSettingsV1 } from '../../shared/app-settings-types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRequest = any
type AnyResponse = any

export interface MobileTlsListenerOptions {
  pairingService: MobilePairingService
  port: number
  host: string
  certDir: string
  now?: () => number
  /** Optional callback to persist audit events into settings. */
  onAudit?: (event: MobileAccessAuditEventV1) => void
  /** Required: forward allowed app-server protocol requests to the Kun runtime. */
  runtimeRequest?: (
    path: string,
    init: { method?: string; body?: string; headers?: Record<string, string> }
  ) => Promise<{ ok: boolean; status: number; body: string }>
}

interface CertStore {
  cert: string
  key: string
  fingerprint: string
}

const CERT_FILE = 'server.crt'
const KEY_FILE = 'server.key'
const FINGERPRINT_FILE = 'server.fingerprint'

/**
 * Control-surface routes that device-scoped tokens are allowed to access.
 * Threads, turns, events, approvals, usage, goal, loop state only.
 * No terminal, settings, credentials, file access, hooks, or automation.
 */
export const ALLOWED_ROUTE_PREFIXES = [
  '/health',
  '/v1/projects',
  '/v1/threads',
  '/v1/sessions',
  '/v1/approvals',
  '/v1/usage',
  '/v1/runtime/info',
  '/v1/goal',
  '/v1/loop'
]

export const BLOCKED_ROUTE_PREFIXES = [
  '/v1/terminal',
  '/v1/settings',
  '/v1/credentials',
  '/v1/providers',
  '/v1/files',
  '/v1/memory',
  '/v1/attachments',
  '/v1/runtime/tools',
  '/v1/runtime/hooks',
  '/v1/skills',
  '/v1/mcp',
  '/v1/config',
  '/v1/remote-runners',
  '/v1/ssh'
]

export function isRouteAllowed(urlPath: string): boolean {
  const normalized = urlPath.split('?')[0] ?? urlPath
  for (const prefix of BLOCKED_ROUTE_PREFIXES) {
    if (normalized.startsWith(prefix)) return false
  }
  for (const prefix of ALLOWED_ROUTE_PREFIXES) {
    if (normalized.startsWith(prefix)) return true
  }
  return false
}

export function getLanAddresses(): string[] {
  const addresses: string[] = []
  const ifaces = networkInterfaces()
  for (const addrs of Object.values(ifaces)) {
    for (const addr of addrs ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        addresses.push(addr.address)
      }
    }
  }
  return addresses
}

export class MobileTlsListener {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private server: any = null
  private started = false
  private certStore: CertStore | null = null

  constructor(private readonly opts: MobileTlsListenerOptions) {}

  getCertFingerprint(): string | null {
    return this.certStore?.fingerprint ?? null
  }

  getHostCandidates(): { host: string; port: number }[] {
    const lanIPs = getLanAddresses()
    if (lanIPs.length === 0) {
      return [{ host: 'localhost', port: this.opts.port }]
    }
    return lanIPs.map((ip) => ({ host: ip, port: this.opts.port }))
  }

  isRunning(): boolean {
    return this.started && this.server !== null
  }

  async start(): Promise<void> {
    if (this.started) return

    this.certStore = this.loadOrGenerateCert()
    const { cert, key } = this.certStore
    const pairingService = this.opts.pairingService

    const requestHandler = this.createRequestHandler(pairingService)

    this.server = createSecureServer({ cert, key, allowHTTP1: true }, (req: AnyRequest, res: AnyResponse) => {
      requestHandler(req, res)
    })

    await new Promise<void>((resolve, reject) => {
      this.server!.listen(this.opts.port, this.opts.host, () => {
        resolve()
      })
      this.server!.on('error', (err: Error) => {
        reject(err)
      })
    })

    this.started = true
    this.emitAudit('tls_listener_started', pairingService)
  }

  async stop(): Promise<void> {
    if (!this.started || !this.server) return
    const pairingService = this.opts.pairingService
    await new Promise<void>((resolve) => {
      this.server!.close(() => {
        resolve()
      })
    })
    this.server = null
    this.started = false
    this.emitAudit('tls_listener_stopped', pairingService)
  }

  private createRequestHandler(pairingService: MobilePairingService) {
    return async (req: AnyRequest, res: AnyResponse) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Device-Token')

      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      const url = new URL(req.url ?? '/', `https://${req.headers.host ?? 'localhost'}`)
      const path = url.pathname

      // Pairing claim endpoint — no token needed
      if (req.method === 'POST' && path === '/mobile/pair') {
        await handlePairingClaim(req, res, pairingService)
        return
      }

      // All other routes require device token auth
      const authResult = authenticateDeviceToken(req, pairingService)
      if (!authResult.valid) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: authResult.reason }))
        return
      }

      // Scope enforcement
      if (!isRouteAllowed(path)) {
        this.emitAudit('scope_denied', pairingService, authResult.deviceId, authResult.deviceName, `Route ${path} is not in control-surface scope`)
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Device tokens only have control-surface scope. This route is not allowed.' }))
        return
      }

      // Forward to Kun runtime via injected runtime request callback
      await handleRuntimeProxy(req, res, url, path, this.opts, authResult)
    }
  }

  /* ---------------------- cert management ---------------------- */

  private loadOrGenerateCert(): CertStore {
    const certDir = this.opts.certDir
    const crtPath = join(certDir, CERT_FILE)
    const keyPath = join(certDir, KEY_FILE)
    const fpPath = join(certDir, FINGERPRINT_FILE)

    // Regenerate the cert on every start so the SAN includes current LAN IPs.
    // The private key is reused across restarts to keep the key identity stable;
    // the certificate fingerprint changes when LAN IPs change, which is
    // intentional — the QR payload captures the current fingerprint.
    mkdirSync(certDir, { recursive: true, mode: 0o700 })

    try {
      // Generate private key if it does not already exist
      if (!existsSync(keyPath)) {
        execSync(
          `openssl genrsa -out "${keyPath}" 2048`,
          { stdio: 'pipe', timeout: 15000 }
        )
        chmodIfNeeded(keyPath, 0o600)
      }

      // Build SAN with current LAN IPs plus loopback identities
      const san = buildSubjectAltName()

      // Generate self-signed certificate
      execSync(
        `openssl req -new -x509 -key "${keyPath}" -out "${crtPath}" -days 3650 -subj "/CN=OpenCodex Mobile Access" -addext "${san}"`,
        { stdio: 'pipe', timeout: 15000 }
      )
    } catch (err) {
      throw new Error(`Failed to generate TLS certificate: ${err instanceof Error ? err.message : String(err)}`)
    }

    const cert = readFileSync(crtPath, 'utf-8')
    const key = readFileSync(keyPath, 'utf-8')
    const fingerprint = computeSha256Fingerprint(cert)

    writeFileSync(fpPath, fingerprint, { encoding: 'utf-8', mode: 0o600 })

    return { cert, key, fingerprint }
  }

  private emitAudit(
    action: MobileAccessAuditEventV1['action'],
    pairingService: MobilePairingService,
    deviceId?: string,
    deviceName?: string,
    details?: string
  ): void {
    const entry: MobileAccessAuditEventV1 = {
      id: randomUUID(),
      timestamp: new Date(this.opts.now?.() ?? Date.now()).toISOString(),
      actor: 'system',
      ...(deviceId ? { deviceId } : {}),
      ...(deviceName ? { deviceName } : {}),
      action,
      ...(details ? { details } : {})
    }
    // Emit via the pairing service's settings persistence path for audit log
    if (this.opts.onAudit) {
      this.opts.onAudit(entry)
    }
  }
}

function buildSubjectAltName(): string {
  const entries = ['DNS:localhost', 'IP:127.0.0.1']
  const lanIPs = getLanAddresses()
  for (const ip of lanIPs) {
    if (ip !== '127.0.0.1') {
      entries.push(`IP:${ip}`)
    }
  }
  return `subjectAltName=${entries.join(',')}`
}

function computeSha256Fingerprint(certPem: string): string {
  const certPart = certPem
    .replace('-----BEGIN CERTIFICATE-----', '')
    .replace('-----END CERTIFICATE-----', '')
    .replace(/[\r\n\s]/g, '')
  const der = Buffer.from(certPart, 'base64')
  return createHash('sha256').update(der).digest('hex').slice(0, 32)
}

function chmodIfNeeded(filePath: string, mode: number): void {
  try {
    chmodSync(filePath, mode)
  } catch { /* best effort */ }
}

export function authenticateDeviceToken(
  req: AnyRequest,
  pairingService: MobilePairingService
): { valid: true; deviceId: string; deviceName: string } | { valid: false; reason: string } {
  const authHeader = req.headers.authorization
  let token: string | null = null

  if (authHeader) {
    const match = /^Bearer\s+(.+)$/i.exec(authHeader)
    if (match) token = match[1].trim()
  }

  if (!token) {
    const deviceTokenHeader = req.headers['x-device-token']
    if (typeof deviceTokenHeader === 'string') token = deviceTokenHeader.trim()
  }

  if (!token) {
    return { valid: false, reason: 'Device token required. Use Authorization: Bearer <token> or X-Device-Token header.' }
  }

  return pairingService.validateDeviceToken(token)
}

async function readJsonBody(req: AnyRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8')
        resolve(raw ? JSON.parse(raw) : null)
      } catch {
        reject(new Error('Invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

async function handlePairingClaim(
  req: AnyRequest,
  res: AnyResponse,
  pairingService: MobilePairingService
): Promise<void> {
  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Invalid JSON body.' }))
    return
  }

  if (!body || typeof body !== 'object') {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Invalid request body. Expected JSON with pairingCode and deviceName.' }))
    return
  }

  const payload = body as { pairingCode?: string; deviceName?: string }
  const pairingCode = payload.pairingCode?.trim() ?? ''
  const deviceName = payload.deviceName?.trim() ?? 'My Phone'

  if (!pairingCode) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'pairingCode is required.' }))
    return
  }

  const validation = pairingService.validatePairingCode(pairingCode)
  if (!validation.valid) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: validation.reason }))
    return
  }

  const consumed = pairingService.consumePairingCode(pairingCode)
  if (!consumed) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Pairing code has already been used or expired.' }))
    return
  }

  const { deviceId, token } = pairingService.issueDeviceToken(deviceName)

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({
    ok: true,
    deviceId,
    token,
    deviceName
  }))
}

async function handleRuntimeProxy(
  req: AnyRequest,
  res: AnyResponse,
  url: URL,
  path: string,
  opts: MobileTlsListenerOptions,
  authResult: { valid: true; deviceId: string; deviceName: string }
): Promise<void> {
  if (!opts.runtimeRequest) {
    res.writeHead(503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Runtime proxy is not available. The desktop app must be running.' }))
    return
  }

  let body: string | undefined
  try {
    // Read request body (if present) and forward it to the runtime
    body = await readRequestBody(req)
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Failed to read request body.' }))
    return
  }

  // Collect forwarded headers: passthrough Content-Type, Accept, and select Kun headers
  const fwdHeaders: Record<string, string> = {}
  const passthroughHeaders = ['content-type', 'accept', 'accept-language']
  for (const h of passthroughHeaders) {
    const val = req.headers[h]
    if (typeof val === 'string' && val.trim()) {
      fwdHeaders[h] = val
    }
  }

  // Route path to Kun: reuse the full URL path including query string
  const runtimePath = url.pathname + url.search

  try {
    const result = await opts.runtimeRequest(runtimePath, {
      method: req.method,
      body,
      headers: fwdHeaders
    })

    // Proxy the runtime response back
    const proxyHeaders: OutgoingHttpHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device-Token',
      'X-Device-Id': authResult.deviceId,
      'X-Device-Name': authResult.deviceName
    }
    res.writeHead(result.status, proxyHeaders)
    res.end(result.body)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: `Runtime proxy error: ${message}` }))
  }
}

async function readRequestBody(req: AnyRequest): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      resolve(chunks.length > 0 ? Buffer.concat(chunks).toString('utf-8') : undefined)
    })
    req.on('error', reject)
  })
}
