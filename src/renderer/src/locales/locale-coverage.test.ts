import { describe, expect, it } from 'vitest'
import arCommon from './ar/common.json'
import arSettings from './ar/settings.json'
import enCommon from './en/common.json'
import enSettings from './en/settings.json'
import zhCommon from './zh/common.json'
import zhSettings from './zh/settings.json'

type LocaleObject = Record<string, unknown>

const namespaces = ['common', 'settings'] as const
const localeResources = {
  en: { common: enCommon, settings: enSettings },
  ar: { common: arCommon, settings: arSettings },
  zh: { common: zhCommon, settings: zhSettings }
} as const

function readLocale(locale: 'en' | 'ar' | 'zh', namespace: typeof namespaces[number]): LocaleObject {
  return localeResources[locale][namespace] as LocaleObject
}

function flattenKeys(value: LocaleObject, prefix = ''): string[] {
  const keys: string[] = []
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      keys.push(...flattenKeys(child as LocaleObject, path))
    } else {
      keys.push(path)
    }
  }
  return keys.sort((a, b) => a.localeCompare(b))
}

function getLeafEntries(obj: LocaleObject, prefix = ''): [string, unknown][] {
  const entries: [string, unknown][] = []
  for (const [key, child] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      entries.push(...getLeafEntries(child as LocaleObject, path))
    } else {
      entries.push([path, child])
    }
  }
  return entries
}

// Proper nouns and technical identifiers that may stay identical to English.
// Keys matching these patterns are exempt from the identical-value check.
// Also: values that are pure template placeholders (e.g. "{{cost}}") or
// structural patterns (e.g. "codex/worker-branch") are exempt.
const PROPER_NOUN_KEY_PATTERNS = [
  /^appName$/,
  /^clawCoreTitle$/,
  /^clawWebhook/,
  /^clawSidebarIm$/,
  /^clawAddImModeWebhook$/,
  /^clawAddImTarget/,
  /^clawAddImCredential/,
  /^clawManageAgentMeta$/,
  /^modelEndpoint/,
  /^workspaceRootPlaceholder$/,
  /^writeWorkspaceRootPlaceholder$/,
  /^guiUpdateChannelFrontier$/,
  /^guiUpdateChannelStable$/,
  /^windowsMenuUnknownVersion$/,
  /^clawHelpCommand/,
  /^toolBuiltinBash$/,
  /^pluginCustom/,
  /^scheduleStatus_/,
  // Proper noun product/tech names as leaf values
  /^missionMcpSummary$/,
  /^surfaceDiagnosticsMcp$/,
  /^gitWorktreeBranchPlaceholder$/,
  /^sidebarMcp$/,
  /^pluginTabMcp$/,
  /^pluginMcpPlaywrightTitle$/,
  /^pluginMcpGithubTitle$/,
  /^pluginMcpContext7Title$/,
]

function isProperNounKey(key: string): boolean {
  return PROPER_NOUN_KEY_PATTERNS.some((p) => p.test(key))
}

// Values that are identical to English by design: filesystem paths, URLs,
// pure placeholder templates, and known technical identifiers.
const PROPER_NOUN_VALUES = new Set([
  '~/.opencodex/default_workspace',
  '~/.opencodex/write_workspace',
  'https://api.deepseek.com',
])

function isPurePlaceholderTemplate(value: string): boolean {
  // Values that are nothing but {{placeholders}} with optional punctuation/spaces/slashes.
  // After stripping all {{name}} tokens, only trivial separators should remain.
  const stripped = value.replace(/\{\{\w+\}\}/g, '')
  return /^[{} /|·.-]*$/.test(stripped)
}

describe('renderer locale coverage', () => {
  it('keeps English and Chinese locale keys aligned in every namespace', () => {
    for (const namespace of namespaces) {
      const enKeys = flattenKeys(readLocale('en', namespace))
      const zhKeys = flattenKeys(readLocale('zh', namespace))

      expect(zhKeys).toEqual(enKeys)
    }
  })

  it('keeps Arabic keys mapped to real English fallback keys', () => {
    for (const namespace of namespaces) {
      const enKeys = new Set(flattenKeys(readLocale('en', namespace)))
      const arExtraKeys = flattenKeys(readLocale('ar', namespace))
        .filter((key) => !enKeys.has(key))

      expect(arExtraKeys).toEqual([])
    }
  })

  it('enforces Arabic full key parity with English (no missing keys)', () => {
    for (const namespace of namespaces) {
      const enKeys = new Set(flattenKeys(readLocale('en', namespace)))
      const arKeys = new Set(flattenKeys(readLocale('ar', namespace)))

      const missingInAr = [...enKeys].filter((k) => !arKeys.has(k))
      expect(missingInAr).toEqual([])
    }
  })

  it('rejects empty Arabic string values', () => {
    for (const namespace of namespaces) {
      const entries = getLeafEntries(readLocale('ar', namespace))
      const emptyVals = entries.filter(([, v]) => {
        if (typeof v !== 'string') return false
        return v.trim() === ''
      })
      const emptyKeys = emptyVals.map(([k]) => k)
      expect(emptyKeys).toEqual([])
    }
  })

  it('rejects Arabic values identical to English unless whitelisted as proper nouns', () => {
    for (const namespace of namespaces) {
      const enEntries = new Map(getLeafEntries(readLocale('en', namespace)))
      const arEntries = getLeafEntries(readLocale('ar', namespace))

      const untranslated = arEntries.filter(([key, arVal]) => {
        if (typeof arVal !== 'string' || arVal.trim() === '') return false
        const enVal = enEntries.get(key)
        if (typeof enVal !== 'string') return false
        if (arVal !== enVal) return false
        if (isProperNounKey(key)) return false
        if (PROPER_NOUN_VALUES.has(arVal)) return false
        if (isPurePlaceholderTemplate(arVal)) return false
        return true
      })
      const untranslatedKeys = untranslated.map(([k]) => k)
      expect(untranslatedKeys).toEqual([])
    }
  })
})
