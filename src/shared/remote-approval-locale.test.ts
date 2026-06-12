import { describe, expect, it } from 'vitest'
import {
  resolveAppLocale,
  getRemoteApprovalLocale,
  localizedApprovalTitle,
  localizedApprovalMessage,
  localizedApprovalDetail,
  localizedApprovalButtons,
  type RemoteApprovalLocaleStrings,
} from '../shared/remote-approval-locale'

describe('resolveAppLocale', () => {
  it('returns "en" for undefined', () => {
    expect(resolveAppLocale(undefined)).toBe('en')
  })

  it('returns "en" for null', () => {
    expect(resolveAppLocale(null)).toBe('en')
  })

  it('returns "en" for empty string', () => {
    expect(resolveAppLocale('')).toBe('en')
  })

  it('returns "en" for whitespace-only', () => {
    expect(resolveAppLocale('   ')).toBe('en')
  })

  it('returns "en" for unknown locale code', () => {
    expect(resolveAppLocale('fr')).toBe('en')
  })

  it('returns "en" for "en"', () => {
    expect(resolveAppLocale('en')).toBe('en')
  })

  it('returns "zh" for "zh"', () => {
    expect(resolveAppLocale('zh')).toBe('zh')
  })

  it('returns "ar" for "ar"', () => {
    expect(resolveAppLocale('ar')).toBe('ar')
  })
})

describe('getRemoteApprovalLocale', () => {
  it('returns strings for en', () => {
    const l = getRemoteApprovalLocale('en')
    expect(l.dialogTitle).toContain('REMOTE')
    expect(l.dialogMessage).toContain('REMOTE')
    expect(l.dialogDetail).toContain('REMOTE')
  })

  it('returns strings for zh', () => {
    const l = getRemoteApprovalLocale('zh')
    expect(l.dialogTitle).toContain('远程')
    expect(l.dialogMessage).toContain('远程')
    expect(l.dialogDetail).toContain('远程')
  })

  it('returns strings for ar', () => {
    const l = getRemoteApprovalLocale('ar')
    expect(l.dialogTitle).toContain('عن بعد')
    expect(l.dialogMessage).toContain('البعيد')
    expect(l.dialogDetail).toContain('بعيد')
  })

  it('falls back to en for unknown locale', () => {
    const l = getRemoteApprovalLocale('fr' as any)
    expect(l.dialogTitle).toContain('REMOTE')
  })
})

describe('localizedApprovalTitle', () => {
  it('contains REMOTE for en', () => {
    expect(localizedApprovalTitle('en')).toContain('REMOTE')
  })

  it('contains 远程 for zh', () => {
    expect(localizedApprovalTitle('zh')).toContain('远程')
  })

  it('contains عن بعد for ar', () => {
    expect(localizedApprovalTitle('ar')).toContain('عن بعد')
  })
})

describe('localizedApprovalMessage', () => {
  it('includes the host name', () => {
    const msg = localizedApprovalMessage('en', 'my-ssh-server')
    expect(msg).toContain('my-ssh-server')
    expect(msg).toContain('REMOTE')
  })

  it('includes the host name in zh', () => {
    const msg = localizedApprovalMessage('zh', '生产服务器')
    expect(msg).toContain('生产服务器')
    expect(msg).toContain('远程')
  })

  it('includes the host name in ar', () => {
    const msg = localizedApprovalMessage('ar', 'خادم-الإنتاج')
    expect(msg).toContain('خادم-الإنتاج')
    expect(msg).toContain('البعيد')
  })

  it('falls back to en on unknown locale', () => {
    const msg = localizedApprovalMessage('xx', 'host')
    expect(msg).toContain('REMOTE')
    expect(msg).toContain('host')
  })
})

describe('localizedApprovalDetail', () => {
  const params = {
    host: 'prod-server',
    hostId: 'runner-1',
    command: 'npm run build',
    cwd: '/home/user/project',
    time: '2026-06-12T10:00:00Z',
  }

  it('includes all required fields for en', () => {
    const detail = localizedApprovalDetail('en', params)
    expect(detail).toContain('prod-server')
    expect(detail).toContain('runner-1')
    expect(detail).toContain('npm run build')
    expect(detail).toContain('/home/user/project')
    expect(detail).toContain('2026-06-12T10:00:00Z')
    expect(detail).toContain('REMOTE')
  })

  it('includes all required fields for zh', () => {
    const detail = localizedApprovalDetail('zh', params)
    expect(detail).toContain('prod-server')
    expect(detail).toContain('runner-1')
    expect(detail).toContain('npm run build')
    expect(detail).toContain('/home/user/project')
    expect(detail).toContain('2026-06-12T10:00:00Z')
    expect(detail).toContain('远程')
  })

  it('includes all required fields for ar', () => {
    const detail = localizedApprovalDetail('ar', params)
    expect(detail).toContain('prod-server')
    expect(detail).toContain('runner-1')
    expect(detail).toContain('npm run build')
    expect(detail).toContain('/home/user/project')
    expect(detail).toContain('2026-06-12T10:00:00Z')
    expect(detail).toContain('بعيد')
  })

  it('has explicit REMOTE semantics in en', () => {
    const detail = localizedApprovalDetail('en', params)
    expect(detail).toContain('REMOTE machine')
    expect(detail).toContain('remote host')
  })

  it('has explicit remote semantics in zh', () => {
    const detail = localizedApprovalDetail('zh', params)
    expect(detail).toContain('远程计算机')
    expect(detail).toContain('远程主机')
  })

  it('has explicit remote semantics in ar', () => {
    const detail = localizedApprovalDetail('ar', params)
    expect(detail).toContain('جهاز بعيد')
    expect(detail).toContain('البعيد')
  })

  it('falls back to en on unknown locale', () => {
    const detail = localizedApprovalDetail('zz' as any, params)
    expect(detail).toContain('REMOTE')
    expect(detail).toContain('prod-server')
    expect(detail).toContain('Host:')
    expect(detail).toContain('Host ID:')
    expect(detail).toContain('Command:')
    expect(detail).toContain('Directory:')
    expect(detail).toContain('Time:')
  })

  it('does not leak raw template markers', () => {
    const detail = localizedApprovalDetail('en', params)
    expect(detail).not.toContain('{{host}}')
    expect(detail).not.toContain('{{hostId}}')
    expect(detail).not.toContain('{{command}}')
    expect(detail).not.toContain('{{cwd}}')
    expect(detail).not.toContain('{{time}}')
  })
})

describe('localizedApprovalButtons', () => {
  it('returns Deny as first button (index 0/default/cancel) for en', () => {
    const [deny, allow] = localizedApprovalButtons('en')
    expect(deny).toBe('Deny')
    expect(allow).toBe('Allow')
  })

  it('returns Deny as first button for zh', () => {
    const [deny, allow] = localizedApprovalButtons('zh')
    expect(deny).toBe('拒绝')
    expect(allow).toBe('允许')
  })

  it('returns Deny as first button for ar', () => {
    const [deny, allow] = localizedApprovalButtons('ar')
    expect(deny).toBe('رفض')
    expect(allow).toBe('السماح')
  })

  it('returns Deny as first button for fallback', () => {
    const [deny] = localizedApprovalButtons('fr' as any)
    expect(deny).toBe('Deny')
  })

  it('buttons array has exactly 2 items', () => {
    for (const locale of ['en', 'zh', 'ar'] as const) {
      expect(localizedApprovalButtons(locale)).toHaveLength(2)
    }
  })
})

describe('locale string consistency', () => {
  it('all three locales define identical keys', () => {
    const en = getRemoteApprovalLocale('en')
    const zh = getRemoteApprovalLocale('zh')
    const ar = getRemoteApprovalLocale('ar')

    const enKeys = Object.keys(en).sort()
    const zhKeys = Object.keys(zh).sort()
    const arKeys = Object.keys(ar).sort()

    expect(enKeys).toEqual(zhKeys)
    expect(enKeys).toEqual(arKeys)
  })

  it('all locales have non-empty strings', () => {
    for (const locale of ['en', 'zh', 'ar'] as const) {
      const l = getRemoteApprovalLocale(locale)
      for (const [key, value] of Object.entries(l)) {
        const stripped = String(value).trim()
        if (stripped.length === 0) {
          expect.fail(`Locale ${locale}, key ${key} is empty`)
        }
        expect(stripped.length).toBeGreaterThan(0)
      }
    }
  })

  it('all locales contain REMOTE/remote equivalent', () => {
    const en = getRemoteApprovalLocale('en')
    expect(en.dialogTitle).toMatch(/REMOTE/i)
    expect(en.dialogMessage).toMatch(/REMOTE/i)
    expect(en.dialogDetail).toMatch(/REMOTE/i)

    const zh = getRemoteApprovalLocale('zh')
    expect(zh.dialogTitle).toMatch(/远程/)
    expect(zh.dialogMessage).toMatch(/远程/)
    expect(zh.dialogDetail).toMatch(/远程/)

    const ar = getRemoteApprovalLocale('ar')
    expect(ar.dialogTitle).toMatch(/بعد/)
    expect(ar.dialogMessage).toMatch(/بعيد/)
    expect(ar.dialogDetail).toMatch(/بعيد/)
  })

  it('all locales include {{host}} and {{hostId}} templates in detail', () => {
    for (const locale of ['en', 'zh', 'ar'] as const) {
      const l = getRemoteApprovalLocale(locale)
      // Raw template strings — verify they contain the template markers
      expect(l.dialogDetail).toContain('{{host}}')
      expect(l.dialogDetail).toContain('{{hostId}}')
      expect(l.dialogDetail).toContain('{{command}}')
      expect(l.dialogDetail).toContain('{{cwd}}')
      expect(l.dialogDetail).toContain('{{time}}')
    }
  })
})
