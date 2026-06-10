import { z } from 'zod'

const pathSchema = z.string().trim().min(1).max(4096)
const idSchema = z.string().trim().min(1).max(256)

export const OpenCodexIdeBridgeCapabilitiesSchema = z.object({
  protocolVersion: z.literal(1),
  syncOpenFiles: z.boolean(),
  syncSelections: z.boolean(),
  syncDiagnostics: z.boolean(),
  mutateFiles: z.literal(false),
  executeCommands: z.literal(false)
}).strict()
export type OpenCodexIdeBridgeCapabilities = z.infer<typeof OpenCodexIdeBridgeCapabilitiesSchema>

export const OPEN_CODEX_IDE_BRIDGE_CAPABILITIES: OpenCodexIdeBridgeCapabilities = {
  protocolVersion: 1,
  syncOpenFiles: true,
  syncSelections: true,
  syncDiagnostics: false,
  mutateFiles: false,
  executeCommands: false
}

export const OpenCodexIdeSelectionSchema = z.object({
  path: pathSchema,
  startLine: z.number().int().positive(),
  startColumn: z.number().int().positive(),
  endLine: z.number().int().positive(),
  endColumn: z.number().int().positive()
}).strict()
export type OpenCodexIdeSelection = z.infer<typeof OpenCodexIdeSelectionSchema>

export const OpenCodexIdeContextSyncRequestSchema = z.object({
  workspaceRoot: pathSchema,
  surface: z.enum(['vscode', 'jetbrains', 'zed', 'cursor', 'other']),
  clientId: idSchema,
  activeFile: pathSchema.optional(),
  openFiles: z.array(pathSchema).max(200).default([]),
  selections: z.array(OpenCodexIdeSelectionSchema).max(50).default([]),
  diagnosticsDigest: z.string().trim().max(256).optional()
}).strict()
export type OpenCodexIdeContextSyncRequest = z.input<typeof OpenCodexIdeContextSyncRequestSchema>

export const OpenCodexIdeContextSyncResponseSchema = z.object({
  ok: z.literal(true),
  accepted: z.literal(true),
  capabilities: OpenCodexIdeBridgeCapabilitiesSchema,
  syncedAt: z.string().trim().min(1).max(128),
  trackedFileCount: z.number().int().nonnegative()
}).strict()
export type OpenCodexIdeContextSyncResponse = z.infer<typeof OpenCodexIdeContextSyncResponseSchema>

export function buildIdeContextSyncResponse(
  request: OpenCodexIdeContextSyncRequest,
  now: Date = new Date()
): OpenCodexIdeContextSyncResponse {
  const parsed = OpenCodexIdeContextSyncRequestSchema.parse(request)
  const trackedFiles = new Set(parsed.openFiles)
  if (parsed.activeFile) trackedFiles.add(parsed.activeFile)
  return OpenCodexIdeContextSyncResponseSchema.parse({
    ok: true,
    accepted: true,
    capabilities: OPEN_CODEX_IDE_BRIDGE_CAPABILITIES,
    syncedAt: now.toISOString(),
    trackedFileCount: trackedFiles.size
  })
}
