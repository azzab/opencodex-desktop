import type { LoopScheduler } from '../../services/loop-scheduler-service.js'
import type {
  CreateLoopRequest,
  UpdateLoopRequest,
  LoopRecord
} from '../../contracts/automations.js'
import { CreateLoopRequest as CreateLoopReqSchema, UpdateLoopRequest as UpdateLoopReqSchema } from '../../contracts/automations.js'
import { jsonResponse, type JsonResponse } from '../response.js'
import { readJsonBody } from '../read-json-body.js'

export async function createLoop(
  scheduler: LoopScheduler,
  request: Request
): Promise<JsonResponse> {
  const body = await readJsonBody(request)
  const parsed = CreateLoopReqSchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400)
  }
  const record = await scheduler.create(parsed.data)
  return jsonResponse({ loop: record }, 201)
}

export async function listLoops(
  scheduler: LoopScheduler,
  request: Request
): Promise<JsonResponse> {
  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId') ?? undefined
  const statusParam = url.searchParams.get('status') ?? undefined
  const statusFilter = statusParam
    ? statusParam.split(',').map((s) => s.trim()).filter((s): s is LoopRecord['status'] =>
        ['active', 'paused', 'cancelled', 'expired', 'completed'].includes(s))
    : undefined

  const loops = await scheduler.list({
    projectId,
    status: statusFilter && statusFilter.length > 0 ? statusFilter : undefined
  })
  return jsonResponse({ loops })
}

export async function getLoop(
  scheduler: LoopScheduler,
  id: string
): Promise<JsonResponse> {
  const loop = await scheduler.get(id)
  if (!loop) return jsonResponse({ error: 'loop not found' }, 404)
  return jsonResponse({ loop })
}

export async function updateLoop(
  scheduler: LoopScheduler,
  id: string,
  request: Request
): Promise<JsonResponse> {
  const body = await readJsonBody(request)
  const parsed = UpdateLoopReqSchema.safeParse({ ...body, id })
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400)
  }
  const record = await scheduler.update(id, parsed.data)
  if (!record) return jsonResponse({ error: 'loop not found' }, 404)
  return jsonResponse({ loop: record })
}

export async function pauseLoop(
  scheduler: LoopScheduler,
  id: string
): Promise<JsonResponse> {
  const record = await scheduler.pause(id)
  if (!record) return jsonResponse({ error: 'loop not found' }, 404)
  return jsonResponse({ id, paused: true })
}

export async function resumeLoop(
  scheduler: LoopScheduler,
  id: string
): Promise<JsonResponse> {
  const record = await scheduler.resume(id)
  if (!record) return jsonResponse({ error: 'loop not found or not paused' }, 404)
  return jsonResponse({ id, resumed: true })
}

export async function cancelLoop(
  scheduler: LoopScheduler,
  id: string
): Promise<JsonResponse> {
  const record = await scheduler.cancel(id)
  if (!record) return jsonResponse({ error: 'loop not found' }, 404)
  return jsonResponse({ id, cancelled: true })
}

export async function deleteLoop(
  scheduler: LoopScheduler,
  id: string
): Promise<JsonResponse> {
  const deleted = await scheduler.delete(id)
  if (!deleted) return jsonResponse({ error: 'loop not found' }, 404)
  return jsonResponse({ id, deleted: true })
}
