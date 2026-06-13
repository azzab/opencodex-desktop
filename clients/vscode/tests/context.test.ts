import { describe, expect, it, vi, afterAll } from 'vitest'

// Mock vscode before importing context
vi.mock('vscode', () => {
  return {
    window: {
      activeTextEditor: null,
      activeTerminal: null,
      showErrorMessage: vi.fn(),
      showInformationMessage: vi.fn(),
      showQuickPick: vi.fn(),
      showInputBox: vi.fn()
    },
    workspace: {
      getWorkspaceFolder: vi.fn().mockReturnValue(null),
      findFiles: vi.fn().mockResolvedValue([]),
      fs: {
        readFile: vi.fn().mockResolvedValue(new Uint8Array())
      },
      getConfiguration: vi.fn().mockReturnValue({
        get: vi.fn()
      })
    },
    Uri: {
      file: (p: string) => ({ fsPath: p, path: p, scheme: 'file' } as any),
      joinPath: (base: any, ...paths: string[]) => ({ fsPath: [base.fsPath, ...paths].join('/') } as any),
      parse: (s: string) => ({ fsPath: s.replace(/^[^:]+:/, ''), path: s, scheme: 'file' } as any)
    },
    RelativePattern: class {
      constructor(public base: any, public pattern: string) {}
    },
    ThemeColor: class {}
  }
})

import { describe as d2, expect as e2, it as i2 } from 'vitest'
import { gatherContext, listWorkspaceFiles } from '../src/context.js'

describe('context attachment — VS Code editor state', () => {
  it('gatherContext is callable without active editor', () => {
    const ctx = gatherContext()
    expect(ctx).toBeDefined()
    expect(ctx.activeFile).toBeNull()
    expect(ctx.activeSelection).toBeNull()
    expect(ctx.attachedFiles).toEqual([])
    expect(ctx.terminalOutput).toBeNull()
  })

  it('gatherContext has the expected shape', () => {
    const ctx = gatherContext()
    expect(typeof ctx).toBe('object')
    expect('activeFile' in ctx).toBe(true)
    expect('activeSelection' in ctx).toBe(true)
    expect('attachedFiles' in ctx).toBe(true)
    expect('terminalOutput' in ctx).toBe(true)
  })

  it('listWorkspaceFiles returns empty for empty root', async () => {
    const files = await listWorkspaceFiles('')
    expect(files).toEqual([])
  })
})
