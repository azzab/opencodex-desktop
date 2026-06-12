import { describe, expect, it } from 'vitest'

/**
 * EvidencePanel extraction logic tests.
 *
 * The EvidencePanel component extracts evidence from automation tool-result
 * blocks in the chat store. These tests verify the extraction logic
 * using the same pattern as the component (ToolBlock with kind: 'tool',
 * toolName in meta, and JSON detail).
 */

type ExtractedEvidence = {
  id: string
  kind: 'screenshot' | 'console' | 'network'
  timestamp: string
  screenshotBase64?: string
  screenshotUrl?: string
  url?: string
  title?: string
  consoleEntries?: Array<{
    type: string
    text: string
    timestamp?: string
    location?: string
  }>
  networkEntries?: Array<{
    method: string
    url: string
    status: number
    statusText?: string
    timestamp?: string
  }>
}

type TestBlock = {
  kind: string
  detail?: string
  createdAt?: string
  meta?: Record<string, unknown>
}

function extractEvidenceFromBlocks(blocks: TestBlock[]): ExtractedEvidence[] {
  const evidence: ExtractedEvidence[] = []
  const seen = new Set<string>()

  for (const block of blocks) {
    if (block.kind !== 'tool') continue

    const toolName =
      block.meta && typeof block.meta === 'object' && 'toolName' in block.meta
        ? String(block.meta.toolName)
        : undefined

    if (
      toolName !== 'browser_navigate' &&
      toolName !== 'browser_screenshot' &&
      toolName !== 'browser_click' &&
      toolName !== 'browser_type'
    ) {
      continue
    }

    let output: Record<string, unknown> | null = null
    if (block.detail) {
      try {
        output = JSON.parse(block.detail) as Record<string, unknown>
      } catch {
        continue
      }
    }

    if (!output) continue

    const ev = output.evidence as Record<string, unknown> | undefined
    if (!ev) continue

    const timestamp = block.createdAt ?? new Date().toISOString()

    const base: Omit<
      ExtractedEvidence,
      'id' | 'kind' | 'screenshotBase64' | 'consoleEntries' | 'networkEntries'
    > = {
      timestamp,
      url: typeof ev.url === 'string' ? ev.url : undefined,
      title: typeof ev.title === 'string' ? ev.title : undefined
    }

    const screenshotBase64 =
      typeof ev.screenshotBase64 === 'string' ? ev.screenshotBase64 : undefined
    if (screenshotBase64) {
      const id = `scr_${evidence.length}`
      if (!seen.has(id)) {
        seen.add(id)
        evidence.push({
          ...base,
          id,
          kind: 'screenshot',
          screenshotBase64,
          screenshotUrl:
            typeof ev.screenshotUrl === 'string'
              ? ev.screenshotUrl
              : undefined
        })
      }
    }

    const consoleEntries = ev.consoleEntries as
      | Array<{ type: string; text: string; timestamp?: string; location?: string }>
      | undefined
    if (Array.isArray(consoleEntries) && consoleEntries.length > 0) {
      const id = `con_${evidence.length}`
      if (!seen.has(id)) {
        seen.add(id)
        evidence.push({ ...base, id, kind: 'console', consoleEntries })
      }
    }

    const networkEntries = ev.networkEntries as
      | Array<{ method: string; url: string; status: number; statusText?: string; timestamp?: string }>
      | undefined
    if (Array.isArray(networkEntries) && networkEntries.length > 0) {
      const id = `net_${evidence.length}`
      if (!seen.has(id)) {
        seen.add(id)
        evidence.push({ ...base, id, kind: 'network', networkEntries })
      }
    }
  }

  return evidence
}

describe('evidence extraction from blocks', () => {
  it('extracts screenshot evidence from browser_navigate tool result', () => {
    const blocks: TestBlock[] = [
      {
        kind: 'tool',
        createdAt: '2026-06-12T00:00:00.000Z',
        meta: { toolName: 'browser_navigate' },
        detail: JSON.stringify({
          status: 'ok',
          evidence: {
            title: 'My Page',
            url: 'http://localhost:3000',
            screenshotCaptured: true,
            screenshotBase64: 'deadbeef',
            screenshotUrl: 'http://localhost:3000',
            consoleEntries: [
              { type: 'log', text: 'ready', timestamp: '2026-06-12T00:00:00.000Z' }
            ],
            networkEntries: [
              { method: 'GET', url: 'http://localhost:3000/api', status: 200, timestamp: '2026-06-12T00:00:00.000Z' }
            ]
          }
        })
      }
    ]

    const evidence = extractEvidenceFromBlocks(blocks)

    expect(evidence).toHaveLength(3)

    const screenshots = evidence.filter((e) => e.kind === 'screenshot')
    const consoles = evidence.filter((e) => e.kind === 'console')
    const networks = evidence.filter((e) => e.kind === 'network')

    expect(screenshots).toHaveLength(1)
    expect(consoles).toHaveLength(1)
    expect(networks).toHaveLength(1)

    expect(screenshots[0].screenshotBase64).toBe('deadbeef')
    expect(screenshots[0].title).toBe('My Page')
    expect(consoles[0].consoleEntries).toHaveLength(1)
    expect(consoles[0].consoleEntries![0].text).toBe('ready')
    expect(networks[0].networkEntries).toHaveLength(1)
    expect(networks[0].networkEntries![0].status).toBe(200)
  })

  it('returns empty array when no automation blocks exist', () => {
    const blocks: TestBlock[] = [
      { kind: 'assistant', detail: 'Hello' }
    ]
    expect(extractEvidenceFromBlocks(blocks)).toEqual([])
  })

  it('skips non-automation tool results', () => {
    const blocks: TestBlock[] = [
      {
        kind: 'tool',
        meta: { toolName: 'read' },
        detail: 'file contents'
      }
    ]
    expect(extractEvidenceFromBlocks(blocks)).toEqual([])
  })

  it('handles blocks without evidence gracefully', () => {
    const blocks: TestBlock[] = [
      {
        kind: 'tool',
        meta: { toolName: 'browser_navigate' },
        detail: JSON.stringify({ status: 'failed', message: 'blocked' })
      }
    ]
    expect(extractEvidenceFromBlocks(blocks)).toEqual([])
  })

  it('extracts from browser_screenshot tool results', () => {
    const blocks: TestBlock[] = [
      {
        kind: 'tool',
        createdAt: '2026-06-12T00:00:01.000Z',
        meta: { toolName: 'browser_screenshot' },
        detail: JSON.stringify({
          status: 'ok',
          evidence: {
            screenshotBase64: 'abc123',
            screenshotUrl: 'http://localhost:3000',
            screenshotCaptured: true
          }
        })
      }
    ]

    const evidence = extractEvidenceFromBlocks(blocks)
    expect(evidence).toHaveLength(1)
    expect(evidence[0].kind).toBe('screenshot')
    expect(evidence[0].screenshotBase64).toBe('abc123')
  })

  it('handles tool blocks without meta gracefully', () => {
    const blocks: TestBlock[] = [
      {
        kind: 'tool',
        detail: JSON.stringify({
          status: 'ok',
          evidence: { title: 'test' }
        })
      }
    ]
    expect(extractEvidenceFromBlocks(blocks)).toEqual([])
  })
})
