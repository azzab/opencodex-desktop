import type { JsonResponse } from '../response.js'
import { jsonResponse } from '../response.js'
import type { ServerRuntime } from './server-runtime.js'
import { readJsonBody } from '../read-json-body.js'
import type { KunErrorBody } from '../../contracts/errors.js'
import {
  CreateCheckpointRequest,
  RestoreCheckpointRequest,
  ForkFromCheckpointRequest,
  DirtyWorkspaceRestoreError
} from '../../contracts/checkpoints.js'

const ERROR_NOT_FOUND: KunErrorBody = {
  code: 'not_found',
  message: 'checkpoint not found'
}

export async function createCheckpoint(
  runtime: ServerRuntime,
  request: Request
): Promise<JsonResponse> {
  const bodyResult = await readJsonBody(request)
  if (!bodyResult.ok) return bodyResult.response
  const parsed = CreateCheckpointRequest.safeParse(bodyResult.value)
  if (!parsed.success) {
    return jsonResponse({
      code: 'validation_error',
      message: 'invalid create checkpoint request',
      details: parsed.error.issues
    }, 400)
  }
  const checkpoint = await runtime.checkpointService.create(parsed.data)
  return jsonResponse({ checkpoint }, 201)
}

export async function getCheckpoint(
  runtime: ServerRuntime,
  id: string
): Promise<JsonResponse> {
  const checkpoint = await runtime.checkpointService.get(id)
  if (!checkpoint) return jsonResponse(ERROR_NOT_FOUND, 404)
  return jsonResponse({ checkpoint })
}

export async function listCheckpoints(
  runtime: ServerRuntime,
  threadId: string
): Promise<JsonResponse> {
  const checkpoints = await runtime.checkpointService.list(threadId)
  return jsonResponse({ checkpoints })
}

export async function restoreCheckpoint(
  runtime: ServerRuntime,
  id: string,
  request: Request
): Promise<JsonResponse> {
  const bodyResult = await readJsonBody(request)
  if (!bodyResult.ok) return bodyResult.response
  const parsed = RestoreCheckpointRequest.safeParse({ ...(bodyResult.value as Record<string, unknown> ?? {}), checkpointId: id })
  if (!parsed.success) {
    return jsonResponse({
      code: 'validation_error',
      message: 'invalid restore checkpoint request',
      details: parsed.error.issues
    }, 400)
  }
  try {
    const result = await runtime.checkpointService.restore(parsed.data)
    return jsonResponse(result)
  } catch (error) {
    if (error instanceof DirtyWorkspaceRestoreError) {
      return jsonResponse({
        code: error.code,
        message: error.message,
        details: {
          stagedFiles: error.details.stagedFiles,
          unstagedFiles: error.details.unstagedFiles,
          untrackedFiles: error.details.untrackedFiles
        }
      }, 409)
    }
    throw error
  }
}

export async function forkFromCheckpoint(
  runtime: ServerRuntime,
  id: string,
  request: Request
): Promise<JsonResponse> {
  const bodyResult = await readJsonBody(request)
  if (!bodyResult.ok) return bodyResult.response
  const parsed = ForkFromCheckpointRequest.safeParse({ ...(bodyResult.value as Record<string, unknown> ?? {}), checkpointId: id })
  if (!parsed.success) {
    return jsonResponse({
      code: 'validation_error',
      message: 'invalid fork checkpoint request',
      details: parsed.error.issues
    }, 400)
  }
  const result = await runtime.checkpointService.fork(parsed.data)
  return jsonResponse(result, 201)
}

export async function deleteCheckpoint(
  runtime: ServerRuntime,
  id: string
): Promise<JsonResponse> {
  const deleted = await runtime.checkpointService.delete(id)
  if (!deleted) return jsonResponse(ERROR_NOT_FOUND, 404)
  return jsonResponse({ id, deleted: true })
}
