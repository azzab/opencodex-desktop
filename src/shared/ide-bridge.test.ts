import { describe, expect, it } from 'vitest'
import {
  OPEN_CODEX_IDE_BRIDGE_CAPABILITIES,
  OpenCodexIdeContextSyncRequestSchema,
  buildIdeContextSyncResponse
} from './ide-bridge'

describe('IDE bridge contract', () => {
  it('accepts a read-only IDE context sync payload', () => {
    const request = OpenCodexIdeContextSyncRequestSchema.parse({
      workspaceRoot: '/repo',
      surface: 'vscode',
      clientId: 'ide_1',
      activeFile: '/repo/src/main.ts',
      openFiles: ['/repo/src/main.ts', '/repo/src/app.ts'],
      selections: [{
        path: '/repo/src/main.ts',
        startLine: 1,
        startColumn: 1,
        endLine: 2,
        endColumn: 5
      }],
      diagnosticsDigest: 'sha256:abc'
    })

    expect(request).toMatchObject({
      workspaceRoot: '/repo',
      surface: 'vscode',
      openFiles: ['/repo/src/main.ts', '/repo/src/app.ts']
    })
  })

  it('builds a non-mutating context sync response', () => {
    const response = buildIdeContextSyncResponse({
      workspaceRoot: '/repo',
      surface: 'zed',
      clientId: 'ide_2',
      activeFile: '/repo/src/main.ts',
      openFiles: ['/repo/src/main.ts', '/repo/src/app.ts']
    }, new Date('2026-06-10T12:00:00.000Z'))

    expect(response).toEqual({
      ok: true,
      accepted: true,
      capabilities: OPEN_CODEX_IDE_BRIDGE_CAPABILITIES,
      syncedAt: '2026-06-10T12:00:00.000Z',
      trackedFileCount: 2
    })
    expect(response.capabilities).toMatchObject({
      mutateFiles: false,
      executeCommands: false
    })
  })
})
