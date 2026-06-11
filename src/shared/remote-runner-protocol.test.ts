import { describe, expect, it } from 'vitest'
import {
  REMOTE_RUNNER_PROTOCOL_VERSION,
  RemoteRunnerAuditEventSchema,
  RemoteRunnerCapabilityHandshakeSchema,
  RemoteRunnerSessionControlMessageSchema,
  RemoteSshHostConfigSchema,
  redactRemoteRunnerConfig
} from './remote-runner-protocol'

const now = '2026-06-10T12:00:00.000Z'

describe('remote runner protocol', () => {
  it('validates SSH runner handshakes with host-mediated trust boundaries', () => {
    const handshake = RemoteRunnerCapabilityHandshakeSchema.parse({
      id: 'runner_ssh_1',
      protocolVersion: REMOTE_RUNNER_PROTOCOL_VERSION,
      type: 'ssh-host',
      label: 'Build runner',
      status: 'available',
      issuedAt: now,
      expiresAt: '2026-06-10T12:10:00.000Z',
      shell: {
        os: 'linux',
        shell: 'bash',
        commandSyntax: 'posix'
      },
      git: {
        available: true,
        worktrees: true,
        partialClone: true,
        lfs: false
      },
      browser: {
        support: 'none',
        evidence: 'unavailable'
      },
      allowedRoots: [{
        id: 'root_build',
        label: 'workspace',
        kind: 'remote',
        trust: 'trusted',
        redaction: 'metadata'
      }],
      toolPolicy: {
        terminal: 'consent_required',
        filesystem: 'consent_required',
        git: 'consent_required',
        browser: 'unavailable',
        artifacts: 'metadata_only'
      },
      dataPolicy: {
        defaultAllowed: ['thread_metadata', 'redacted_progress', 'approval_metadata', 'audit_metadata'],
        consentRequired: ['selected_file_excerpt', 'diff_excerpt', 'terminal_excerpt'],
        never: ['api_keys', 'oauth_tokens', 'mcp_credentials', 'env_values', 'browser_cookies']
      },
      budget: {
        maxRunSeconds: 900,
        maxInputTokens: 200000,
        maxOutputTokens: 60000,
        maxCostUsd: 3
      },
      approvals: {
        hostApprovalRequired: true,
        remoteMayLowerHostPolicy: false,
        perActionConsentRequired: true
      },
      audit: {
        required: true,
        emitRunIds: true,
        payloadRedaction: 'metadata'
      },
      models: [{
        providerId: 'openrouter',
        modelIds: ['deepseek/deepseek-chat-v4'],
        role: 'worker'
      }],
      credentialStorage: {
        kind: 'ssh-agent',
        credentialRef: 'ssh-agent:build-runner',
        exportsRawSecret: false
      }
    })

    expect(handshake).toMatchObject({
      type: 'ssh-host',
      approvals: {
        hostApprovalRequired: true,
        remoteMayLowerHostPolicy: false
      },
      credentialStorage: {
        exportsRawSecret: false
      }
    })
  })

  it('rejects data policies that allow never-relayed data by default', () => {
    const result = RemoteRunnerCapabilityHandshakeSchema.safeParse({
      id: 'runner_bad',
      protocolVersion: REMOTE_RUNNER_PROTOCOL_VERSION,
      type: 'cloud-worker',
      label: 'Cloud worker',
      status: 'available',
      issuedAt: now,
      shell: { os: 'linux', shell: 'bash', commandSyntax: 'posix' },
      git: { available: true, worktrees: false, partialClone: false, lfs: false },
      browser: { support: 'none', evidence: 'unavailable' },
      allowedRoots: [],
      toolPolicy: {
        terminal: 'metadata_only',
        filesystem: 'metadata_only',
        git: 'metadata_only',
        browser: 'unavailable',
        artifacts: 'metadata_only'
      },
      dataPolicy: {
        defaultAllowed: ['thread_metadata', 'api_keys'],
        consentRequired: [],
        never: ['api_keys']
      },
      budget: { maxRunSeconds: 60 },
      approvals: {
        hostApprovalRequired: true,
        remoteMayLowerHostPolicy: false,
        perActionConsentRequired: true
      },
      audit: { required: true, emitRunIds: true, payloadRedaction: 'metadata' },
      credentialStorage: { kind: 'none', exportsRawSecret: false }
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.message).join('\n')).toContain(
      'never-relayed data classes cannot be default allowed'
    )
  })

  it('rejects fixed never-relayed data even when a runner omits it from the policy never list', () => {
    const result = RemoteRunnerCapabilityHandshakeSchema.safeParse({
      id: 'runner_bad_egress',
      protocolVersion: REMOTE_RUNNER_PROTOCOL_VERSION,
      type: 'cloud-worker',
      label: 'Cloud worker',
      status: 'available',
      issuedAt: now,
      shell: { os: 'linux', shell: 'bash', commandSyntax: 'posix' },
      git: { available: true, worktrees: false, partialClone: false, lfs: false },
      browser: { support: 'none', evidence: 'unavailable' },
      allowedRoots: [],
      toolPolicy: {
        terminal: 'metadata_only',
        filesystem: 'metadata_only',
        git: 'metadata_only',
        browser: 'unavailable',
        artifacts: 'metadata_only'
      },
      dataPolicy: {
        defaultAllowed: ['thread_metadata', 'env_values'],
        consentRequired: ['api_keys'],
        never: []
      },
      budget: { maxRunSeconds: 60 },
      approvals: {
        hostApprovalRequired: true,
        remoteMayLowerHostPolicy: false,
        perActionConsentRequired: true
      },
      audit: { required: true, emitRunIds: true, payloadRedaction: 'metadata' },
      credentialStorage: { kind: 'none', exportsRawSecret: false }
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.message).join('\n')).toContain(
      'fixed never-relayed data classes cannot leave the host'
    )
  })

  it('redacts SSH host config previews and forbids raw secret export', () => {
    const config = RemoteSshHostConfigSchema.parse({
      id: 'ssh_build',
      label: 'Build host',
      enabled: true,
      endpointRef: 'ssh-config:build-host',
      usernameRef: 'keychain:build-user',
      credentialStorage: {
        kind: 'os-keychain',
        credentialRef: 'keychain:ssh-private-key',
        exportsRawSecret: false
      },
      hostKeyPolicy: 'known-hosts'
    })

    const redacted = redactRemoteRunnerConfig({
      ...config,
      nested: {
        authorization: 'Bearer remote-secret-token',
        endpointRef: 'ssh-config:another-host'
      }
    })
    const json = JSON.stringify(redacted)

    expect(json).toContain('<redacted>')
    expect(json).not.toContain('ssh-config:build-host')
    expect(json).not.toContain('keychain:ssh-private-key')
    expect(json).not.toContain('remote-secret-token')
  })

  it('validates host-mediated control and audit messages', () => {
    expect(RemoteRunnerSessionControlMessageSchema.parse({
      id: 'msg_stop_1',
      version: REMOTE_RUNNER_PROTOCOL_VERSION,
      sentAt: now,
      runnerId: 'runner_1',
      runId: 'run_1',
      action: 'stop',
      requestedBy: 'host',
      reason: 'User stopped the run'
    })).toMatchObject({
      action: 'stop',
      requestedBy: 'host'
    })

    expect(RemoteRunnerAuditEventSchema.parse({
      id: 'audit_1',
      version: REMOTE_RUNNER_PROTOCOL_VERSION,
      timestamp: now,
      runnerId: 'runner_1',
      runId: 'run_1',
      actor: 'host',
      action: 'remote-run.stop',
      outcome: 'allowed',
      payloadRedaction: 'metadata',
      sensitivePayload: false
    })).toMatchObject({
      sensitivePayload: false
    })

    expect(RemoteRunnerAuditEventSchema.safeParse({
      id: 'audit_2',
      version: REMOTE_RUNNER_PROTOCOL_VERSION,
      timestamp: now,
      runnerId: 'runner_1',
      actor: 'remote-client',
      action: 'remote-run.approve',
      outcome: 'allowed',
      payloadRedaction: 'explicit_full',
      sensitivePayload: true
    }).success).toBe(false)
  })
})
