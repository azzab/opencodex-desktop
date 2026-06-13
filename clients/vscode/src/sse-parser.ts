/**
 * SSE event parser — pure function with no VS Code dependencies.
 * Extracted from sidebar.ts so it can be tested without the vscode module.
 */

export function parseSseEvent(raw: string): Record<string, unknown> | null {
  const lines = raw.split('\n')
  let data = ''
  let eventType = ''
  for (const line of lines) {
    if (line.startsWith('event:')) eventType = line.slice(6).trim()
    else if (line.startsWith('data:')) data = line.slice(5).trim()
  }
  if (!data) return null
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>
    const item = parsed.item as Record<string, unknown> | undefined
    const eventKind =
      eventType || (parsed.kind as string) || (parsed.type as string) || 'message'

    const text = item?.text ?? parsed.text ?? parsed.delta
    const reasoningText =
      eventKind === 'assistant_reasoning_delta'
        ? (item?.text ?? parsed.text ?? '')
        : null

    const result: Record<string, unknown> = {
      event: eventKind,
      kind: parsed.kind ?? parsed.type,
      status: parsed.status,
      name: parsed.name ?? parsed.toolName,
      toolName: parsed.toolName ?? parsed.name,
      approvalId: parsed.approvalId ?? parsed.id,
      summary: parsed.summary,
      message: parsed.message,
      threadId: parsed.threadId,
      turnId: parsed.turnId,
      toolInput: parsed.toolInput ?? parsed.input,
      toolOutput: parsed.toolOutput ?? parsed.output,
      toolStatus: parsed.toolStatus ?? parsed.status,
      fileChange: parsed.fileChange,
      planEntry: parsed.planEntry ?? parsed.plan
    }
    if (text !== undefined && text !== null) result.text = text
    if (reasoningText) result.reasoningText = reasoningText
    return result
  } catch {
    return { event: eventType || 'message', text: data.slice(0, 500) }
  }
}
