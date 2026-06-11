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
})
