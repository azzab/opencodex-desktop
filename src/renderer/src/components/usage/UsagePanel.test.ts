import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UsagePanel } from './UsagePanel'
import i18n from '../../i18n'
import { formatCompactNumber, formatCost, formatPercent } from '../../hooks/use-thread-usage'
import type { ThreadUsageState, ThreadUsageSummary } from '../../hooks/use-thread-usage'
import type { ModelUsageState, ModelUsageSummary } from '../../hooks/use-model-usage'
import type { DailyUsageState, DailyUsageSummary } from '../../hooks/use-daily-usage'

// ---------------------------------------------------------------------------
// Hoisted mutable state – the single source of truth shared between test
// code and the mocked hooks/store visible inside renderToStaticMarkup.
// ---------------------------------------------------------------------------
const hoisted = vi.hoisted(() => {
  // Mirrors the relevant subset of ChatState that UsagePanel reads.
  const chatState: {
    runtimeConnection: 'idle' | 'ready' | 'error'
    activeThreadId: string | null
    threads: Array<{ id: string; updatedAt: string }>
    usageRefreshKey: number
    busy: boolean
  } = {
    runtimeConnection: 'idle',
    activeThreadId: null,
    threads: [],
    usageRefreshKey: 0,
    busy: false
  }

  const threadUsageState: ThreadUsageState = { usage: null, loading: false, loaded: false }
  const modelUsageState: ModelUsageState = { usage: null, loading: false, loaded: false, error: null }
  const dailyUsageState: DailyUsageState = { usage: null, loading: false, loaded: false, error: null }

  return {
    chatState,
    threadUsageState,
    threadUsage: null as ThreadUsageSummary | null,
    modelUsageState,
    dailyUsageState
  }
})

// ---------------------------------------------------------------------------
// Mock useChatStore so both test code and component code share hoisted.chatState.
// Preserves the real store for setState / getInitialState used in cleanup.
// ---------------------------------------------------------------------------
vi.mock('../../store/chat-store', async () => {
  const actual = await vi.importActual<typeof import('../../store/chat-store')>('../../store/chat-store')
  return {
    ...actual,
    useChatStore: Object.assign(
      (selector?: (s: typeof hoisted.chatState) => unknown) =>
        selector ? selector(hoisted.chatState) : hoisted.chatState,
      {
        setState: actual.useChatStore.setState,
        getState: actual.useChatStore.getState,
        getInitialState: actual.useChatStore.getInitialState,
        subscribe: actual.useChatStore.subscribe
      }
    )
  }
})

// ---------------------------------------------------------------------------
// Mock usage hooks – return values from shared hoisted state objects.
// Preserve real formatting helpers via …actual spread.
// ---------------------------------------------------------------------------
vi.mock('../../hooks/use-thread-usage', async () => {
  const actual = await vi.importActual<typeof import('../../hooks/use-thread-usage')>('../../hooks/use-thread-usage')
  return {
    ...actual,
    useThreadUsageState: vi.fn(() => ({ ...hoisted.threadUsageState })),
    useThreadUsage: vi.fn(() => hoisted.threadUsage)
  }
})

vi.mock('../../hooks/use-model-usage', async () => {
  const actual = await vi.importActual<typeof import('../../hooks/use-model-usage')>('../../hooks/use-model-usage')
  return {
    ...actual,
    useModelUsageState: vi.fn(() => ({ ...hoisted.modelUsageState }))
  }
})

vi.mock('../../hooks/use-daily-usage', async () => {
  const actual = await vi.importActual<typeof import('../../hooks/use-daily-usage')>('../../hooks/use-daily-usage')
  return {
    ...actual,
    useDailyUsageState: vi.fn(() => ({ ...hoisted.dailyUsageState }))
  }
})

// ---------------------------------------------------------------------------
// Cleanup – reset hoisted state to defaults after every test.
// ---------------------------------------------------------------------------
afterEach(() => {
  vi.clearAllMocks()
  hoisted.chatState.runtimeConnection = 'idle'
  hoisted.chatState.activeThreadId = null
  hoisted.chatState.threads = []
  hoisted.chatState.usageRefreshKey = 0
  hoisted.chatState.busy = false

  hoisted.threadUsageState.usage = null
  hoisted.threadUsageState.loading = false
  hoisted.threadUsageState.loaded = false
  hoisted.threadUsage = null

  hoisted.modelUsageState.usage = null
  hoisted.modelUsageState.loading = false
  hoisted.modelUsageState.loaded = false
  hoisted.modelUsageState.error = null

  hoisted.dailyUsageState.usage = null
  hoisted.dailyUsageState.loading = false
  hoisted.dailyUsageState.loaded = false
  hoisted.dailyUsageState.error = null
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function renderUsagePanel(): string {
  return renderToStaticMarkup(createElement(UsagePanel, { onClose: vi.fn() }))
}

/** Set hoisted chat-state so the panel sees a connected runtime with an active thread. */
function connect(threadId = 'thread-1'): void {
  hoisted.chatState.runtimeConnection = 'ready'
  hoisted.chatState.activeThreadId = threadId
  hoisted.chatState.threads = [{ id: threadId, updatedAt: '2025-01-01T00:00:00Z' }]
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const successThreadUsage: ThreadUsageSummary = {
  inputTokens: 8000,
  outputTokens: 3200,
  reasoningTokens: 400,
  cachedTokens: 6400,
  cacheMissTokens: 1600,
  cacheHitRate: 0.8,
  totalTokens: 11200,
  costUsd: 0.049,
  costCny: 0.35,
  cacheSavingsUsd: 0.01,
  cacheSavingsCny: 0.07,
  tokenEconomySavingsTokens: 500,
  tokenEconomySavingsUsd: 0.002,
  tokenEconomySavingsCny: 0.014,
  turns: 4
}

const successThreadUsageNoCache: ThreadUsageSummary = {
  ...successThreadUsage,
  cachedTokens: 0,
  cacheMissTokens: 0,
  cacheHitRate: null
}

const successModelUsage: ModelUsageSummary = {
  groupBy: 'model',
  from: '2025-01-01',
  to: '2025-01-10',
  timezone: 'UTC',
  buckets: [
    {
      model: 'claude-sonnet-4', inputTokens: 50000, outputTokens: 20000, reasoningTokens: 0,
      cachedTokens: 40000, cacheMissTokens: 10000, totalTokens: 70000, costUsd: 0.15,
      costCny: 1.08, cacheSavingsUsd: 0.02, cacheSavingsCny: 0.14,
      tokenEconomySavingsTokens: 0, tokenEconomySavingsUsd: 0, tokenEconomySavingsCny: null,
      turns: 12, threadCount: 3, cacheHitRate: 0.8
    },
    {
      model: 'gemini-2.5-pro', inputTokens: 20000, outputTokens: 8000, reasoningTokens: 1000,
      cachedTokens: 0, cacheMissTokens: 0, totalTokens: 28000, costUsd: 0.03,
      costCny: null, cacheSavingsUsd: 0, cacheSavingsCny: null,
      tokenEconomySavingsTokens: 0, tokenEconomySavingsUsd: 0, tokenEconomySavingsCny: null,
      turns: 5, threadCount: 1, cacheHitRate: null
    }
  ],
  days: [],
  totals: {
    inputTokens: 70000, outputTokens: 28000, reasoningTokens: 1000, cachedTokens: 40000,
    cacheMissTokens: 10000, totalTokens: 98000, costUsd: 0.18, costCny: 1.08,
    cacheSavingsUsd: 0.02, cacheSavingsCny: 0.14, tokenEconomySavingsTokens: 0,
    tokenEconomySavingsUsd: 0, tokenEconomySavingsCny: null,
    turns: 17, threadCount: 4, cacheHitRate: 0.8, days: 10, activeDays: 7
  }
}

const successDailyUsage: DailyUsageSummary = {
  groupBy: 'day',
  from: '2025-01-01',
  to: '2025-01-30',
  timezone: 'UTC',
  buckets: [],
  totals: {
    inputTokens: 300000, outputTokens: 120000, reasoningTokens: 5000, cachedTokens: 240000,
    cacheMissTokens: 60000, totalTokens: 420000, costUsd: 1.25, costCny: 9.0,
    cacheSavingsUsd: 0.15, cacheSavingsCny: 1.08, tokenEconomySavingsTokens: 2000,
    tokenEconomySavingsUsd: 0.01, tokenEconomySavingsCny: 0.07,
    turns: 80, threadCount: 12, cacheHitRate: 0.8, days: 30, activeDays: 22
  }
}

// ===========================================================================
// Tests
// ===========================================================================

describe('UsagePanel', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('renders panel header with title, collapse, and refresh actions', () => {
    const html = renderUsagePanel()
    expect(html).toContain('Usage &amp; Telemetry')
    expect(html).toContain('Collapse right sidebar')
    expect(html).toContain('Refresh usage data')
  })

  it('shows disconnected state when runtime is offline (initial idle state)', () => {
    const html = renderUsagePanel()
    expect(html).toContain('Runtime not connected')
  })

  it('has all required i18n keys in en, zh, and ar', () => {
    const requiredKeys = [
      'usagePanelTitle', 'usagePanelLoading', 'usagePanelEmptyTitle', 'usagePanelEmptySub',
      'usagePanelDisconnectedTitle', 'usagePanelDisconnectedSub',
      'usagePanelNoThread', 'usagePanelNoThreadSub', 'usagePanelRefresh',
      'usagePanelThreadTitle', 'usagePanelSubagentsTitle', 'usagePanelModelTitle',
      'usagePanelAggregateTitle',
      'usageInputTokens', 'usageOutputTokens', 'usageCacheRate', 'usageCacheRead',
      'usageCacheUnknown', 'usageCostEstimate', 'usageTotalTokens', 'usageTurnsCount',
      'usageCacheHitTokens', 'usageCacheSavings', 'usageTokenEconomySavings',
      'usageModelLoading', 'usageModelError', 'usageModelEmpty', 'usageModelTokens',
      'usageModelCost', 'usageModelTurns',
      'usageAggregateLoading', 'usageAggregateError', 'usageAggregateEmpty',
      'usageAggregateTokens', 'usageAggregateCost', 'usageAggregateCacheRate',
      'usageAggregateSavings', 'usageAggregateDays', 'usageAggregateTurns',
      'usageAggregateTokenEconomy',
      'usageSubagentLoading', 'usageSubagentUnavailable', 'usageSubagentNone',
      'usageSubagentRuns', 'usageSubagentTokens', 'usageSubagentTokensShort',
      'usageSubagentCacheRate', 'usageSubagentLabel', 'usageSubagentModel',
      'usageSubagentStatus'
    ]

    for (const key of requiredKeys) {
      const enValue = i18n.t(key, { lng: 'en' })
      expect(enValue, `en key "${key}" must resolve`).toBeTruthy()
      expect(enValue, `en key "${key}" must not fallback to key`).not.toBe(key)

      const zhValue = i18n.t(key, { lng: 'zh' })
      expect(zhValue, `zh key "${key}" must resolve`).toBeTruthy()
      expect(zhValue, `zh key "${key}" must not fallback to key`).not.toBe(key)

      const arValue = i18n.t(key, {
        lng: 'ar',
        defaultValue: i18n.t(key, { lng: 'en' })
      })
      expect(arValue, `ar key "${key}" must resolve`).toBeTruthy()
    }
  })
})

describe('usage formatting helpers', () => {
  it('formatCompactNumber formats large numbers', () => {
    expect(formatCompactNumber(0)).toBe('0')
    expect(formatCompactNumber(500)).toBe('500')
    expect(formatCompactNumber(1_500)).toBe('1.5k')
    expect(formatCompactNumber(1_500_000)).toBe('1.5M')
  })

  it('formatCost formats USD and CNY', () => {
    expect(formatCost(0.125, 'en')).toBe('$0.1250')
    expect(formatCost(0.125, 'zh', 0.88)).toBe('￥0.8800')
    expect(formatCost(1.5, 'en')).toBe('$1.50')
    expect(formatCost(0, 'en')).toBe('$0.0000')
  })

  it('formatPercent handles all cases', () => {
    expect(formatPercent(0)).toBe('0%')
    expect(formatPercent(0.4)).toBe('40%')
    expect(formatPercent(0.946)).toBe('95%')
    expect(formatPercent(1)).toBe('100%')
    expect(formatPercent(0.055)).toBe('5.5%')
  })

  it('formatPercent never shows 0% for unknown/null cache', () => {
    expect(formatPercent(null)).toBe('-')
    expect(formatPercent(undefined as unknown as number | null)).toBe('-')
    expect(formatPercent(null)).not.toBe('0%')
  })
})

describe('Loading state', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    connect()
  })

  it('shows loading spinner when thread usage data is still fetching', () => {
    hoisted.threadUsageState = { usage: null, loading: true, loaded: false }
    hoisted.threadUsage = null

    const html = renderUsagePanel()
    expect(html).toContain(i18n.t('usagePanelLoading', { lng: 'en' }))
    expect(html).not.toContain(i18n.t('usagePanelEmptyTitle', { lng: 'en' }))
    expect(html).not.toContain(i18n.t('usagePanelThreadTitle', { lng: 'en' }))
  })
})

describe('Empty state', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    connect()
  })

  it('shows empty placeholder when thread has no usage data', () => {
    hoisted.threadUsageState = { usage: null, loading: false, loaded: true }
    hoisted.threadUsage = null

    const html = renderUsagePanel()
    expect(html).toContain(i18n.t('usagePanelEmptyTitle', { lng: 'en' }))
    expect(html).toContain(i18n.t('usagePanelEmptySub', { lng: 'en' }))
    expect(html).not.toContain(i18n.t('usagePanelThreadTitle', { lng: 'en' }))
    expect(html).not.toContain(i18n.t('usagePanelSubagentsTitle', { lng: 'en' }))
    expect(html).not.toContain(i18n.t('usagePanelModelTitle', { lng: 'en' }))
    expect(html).not.toContain(i18n.t('usagePanelAggregateTitle', { lng: 'en' }))
  })

  it('shows no-thread placeholder when no active thread but runtime is connected', () => {
    hoisted.chatState.activeThreadId = null
    hoisted.chatState.threads = []

    const html = renderUsagePanel()
    expect(html).toContain(i18n.t('usagePanelNoThread', { lng: 'en' }))
    expect(html).toContain(i18n.t('usagePanelNoThreadSub', { lng: 'en' }))
    expect(html).not.toContain(i18n.t('usagePanelEmptyTitle', { lng: 'en' }))
  })
})

describe('Error state', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    connect()
  })

  it('shows ModelBreakdown error when model usage hook returns an error', () => {
    hoisted.threadUsageState = { usage: successThreadUsage, loading: false, loaded: true }
    hoisted.threadUsage = successThreadUsage
    hoisted.modelUsageState = { usage: null, loading: false, loaded: true, error: 'model usage request failed: 500' }

    const html = renderUsagePanel()
    expect(html).toContain(i18n.t('usagePanelThreadTitle', { lng: 'en' }))
    expect(html).toContain(i18n.t('usageModelError', { lng: 'en', message: 'model usage request failed: 500' }))
    expect(html).not.toContain(i18n.t('usageModelLoading', { lng: 'en' }))
    expect(html).not.toContain(i18n.t('usageModelEmpty', { lng: 'en' }))
  })

  it('shows Aggregate error when daily usage hook returns an error', () => {
    hoisted.threadUsageState = { usage: successThreadUsage, loading: false, loaded: true }
    hoisted.threadUsage = successThreadUsage
    hoisted.dailyUsageState = { usage: null, loading: false, loaded: true, error: 'daily usage request failed: 502' }

    const html = renderUsagePanel()
    expect(html).toContain(i18n.t('usagePanelAggregateTitle', { lng: 'en' }))
    expect(html).toContain(i18n.t('usageAggregateError', { lng: 'en', message: 'daily usage request failed: 502' }))
    expect(html).not.toContain(i18n.t('usageAggregateLoading', { lng: 'en' }))
    expect(html).not.toContain(i18n.t('usageAggregateEmpty', { lng: 'en' }))
  })

  it('shows ModelBreakdown loading spinner when model usage hook is still fetching', () => {
    hoisted.threadUsageState = { usage: successThreadUsage, loading: false, loaded: true }
    hoisted.threadUsage = successThreadUsage
    hoisted.modelUsageState = { usage: null, loading: true, loaded: false, error: null }

    const html = renderUsagePanel()
    expect(html).toContain(i18n.t('usageModelLoading', { lng: 'en' }))
    expect(html).not.toContain(i18n.t('usageModelEmpty', { lng: 'en' }))
  })

  it('shows Aggregate loading spinner when daily usage hook is still fetching', () => {
    hoisted.threadUsageState = { usage: successThreadUsage, loading: false, loaded: true }
    hoisted.threadUsage = successThreadUsage
    hoisted.dailyUsageState = { usage: null, loading: true, loaded: false, error: null }

    const html = renderUsagePanel()
    expect(html).toContain(i18n.t('usageAggregateLoading', { lng: 'en' }))
    expect(html).not.toContain(i18n.t('usageAggregateEmpty', { lng: 'en' }))
  })
})

describe('Success state', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    connect()
  })

  it('renders thread usage metrics when data is available (known cache)', () => {
    hoisted.threadUsageState = { usage: successThreadUsage, loading: false, loaded: true }
    hoisted.threadUsage = successThreadUsage

    const html = renderUsagePanel()
    expect(html).toContain(i18n.t('usagePanelThreadTitle', { lng: 'en' }))
    expect(html).toContain('8.0k')
    expect(html).toContain('3.2k')
    expect(html).toContain('6.4k')
    expect(html).toContain('$0.0490')
    expect(html).toContain('80%')
    expect(html).toContain('11.2k')
    expect(html).not.toContain(i18n.t('usagePanelLoading', { lng: 'en' }))
    expect(html).not.toContain(i18n.t('usagePanelEmptyTitle', { lng: 'en' }))
  })

  it('renders unknown-cache badge when cacheHitRate is null', () => {
    hoisted.threadUsageState = { usage: successThreadUsageNoCache, loading: false, loaded: true }
    hoisted.threadUsage = successThreadUsageNoCache

    const html = renderUsagePanel()
    expect(html).toContain(i18n.t('usageCacheUnknown', { lng: 'en' }))
    expect(html).not.toContain('0%')
  })

  it('renders subagent section header when connected', () => {
    hoisted.threadUsageState = { usage: successThreadUsage, loading: false, loaded: true }
    hoisted.threadUsage = successThreadUsage

    const html = renderUsagePanel()
    expect(html).toContain(i18n.t('usagePanelSubagentsTitle', { lng: 'en' }))
  })

  it('renders savings badges when cache savings and token economy are positive', () => {
    hoisted.threadUsageState = { usage: successThreadUsage, loading: false, loaded: true }
    hoisted.threadUsage = successThreadUsage

    const html = renderUsagePanel()
    expect(html).toContain(i18n.t('usageCacheSavings', { lng: 'en', amount: '$0.0100' }))
    expect(html).toContain(i18n.t('usageTokenEconomySavings', { lng: 'en', tokens: '500' }))
  })

  it('renders model breakdown section with buckets when data is available', () => {
    hoisted.threadUsageState = { usage: successThreadUsage, loading: false, loaded: true }
    hoisted.threadUsage = successThreadUsage
    hoisted.modelUsageState = { usage: successModelUsage, loading: false, loaded: true, error: null }

    const html = renderUsagePanel()
    expect(html).toContain('claude-sonnet-4')
    expect(html).toContain('gemini-2.5-pro')
    expect(html).toContain('70.0k')
    expect(html).toContain('80%')
    expect(html).not.toContain(i18n.t('usageModelLoading', { lng: 'en' }))
    expect(html).not.toContain(i18n.t('usageModelEmpty', { lng: 'en' }))
  })

  it('renders model breakdown empty state when no model buckets exist', () => {
    hoisted.threadUsageState = { usage: successThreadUsage, loading: false, loaded: true }
    hoisted.threadUsage = successThreadUsage
    hoisted.modelUsageState = { usage: { ...successModelUsage, buckets: [] }, loading: false, loaded: true, error: null }

    const html = renderUsagePanel()
    expect(html).toContain(i18n.t('usageModelEmpty', { lng: 'en' }))
  })

  it('renders aggregate section with totals when daily usage data is available', () => {
    hoisted.threadUsageState = { usage: successThreadUsage, loading: false, loaded: true }
    hoisted.threadUsage = successThreadUsage
    hoisted.dailyUsageState = { usage: successDailyUsage, loading: false, loaded: true, error: null }

    const html = renderUsagePanel()
    expect(html).toContain(i18n.t('usagePanelAggregateTitle', { lng: 'en' }))
    expect(html).toContain('420.0k') // total tokens
    expect(html).toContain('$1.25')
    expect(html).toContain('80%')
    expect(html).not.toContain(i18n.t('usageAggregateLoading', { lng: 'en' }))
    expect(html).not.toContain(i18n.t('usageAggregateEmpty', { lng: 'en' }))
  })

  it('renders aggregate empty state when usage is null', () => {
    hoisted.threadUsageState = { usage: successThreadUsage, loading: false, loaded: true }
    hoisted.threadUsage = successThreadUsage
    hoisted.dailyUsageState = { usage: null, loading: false, loaded: true, error: null }

    const html = renderUsagePanel()
    expect(html).toContain(i18n.t('usageAggregateEmpty', { lng: 'en' }))
  })

  it('renders full success state end-to-end (all sections populated)', () => {
    hoisted.threadUsageState = { usage: successThreadUsage, loading: false, loaded: true }
    hoisted.threadUsage = successThreadUsage
    hoisted.modelUsageState = { usage: successModelUsage, loading: false, loaded: true, error: null }
    hoisted.dailyUsageState = { usage: successDailyUsage, loading: false, loaded: true, error: null }

    const html = renderUsagePanel()
    expect(html).toContain(i18n.t('usagePanelThreadTitle', { lng: 'en' }))
    expect(html).toContain(i18n.t('usagePanelSubagentsTitle', { lng: 'en' }))
    expect(html).toContain(i18n.t('usagePanelModelTitle', { lng: 'en' }))
    expect(html).toContain(i18n.t('usagePanelAggregateTitle', { lng: 'en' }))
    expect(html).not.toContain(i18n.t('usagePanelLoading', { lng: 'en' }))
    expect(html).not.toContain(i18n.t('usagePanelEmptyTitle', { lng: 'en' }))
  })
})

describe('unknown cache state contract', () => {
  it('usageCacheUnknown en renders as "Unknown" not "0%"', () => {
    const value = i18n.t('usageCacheUnknown', { lng: 'en' })
    expect(value).toBe('Unknown')
    expect(value).not.toBe('0%')
  })

  it('usageCacheUnknown zh renders as "未知" not "0%"', () => {
    const value = i18n.t('usageCacheUnknown', { lng: 'zh' })
    expect(value).toBe('未知')
    expect(value).not.toBe('0%')
  })

  it('usageCacheUnknown ar renders as non-English text, not "0%"', () => {
    const value = i18n.t('usageCacheUnknown', {
      lng: 'ar',
      defaultValue: i18n.t('usageCacheUnknown', { lng: 'en' })
    })
    expect(value).toBeTruthy()
    expect(value).not.toBe('0%')
    expect(value).not.toBe('Unknown')
  })
})
