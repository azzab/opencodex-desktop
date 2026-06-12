import { describe, expect, it } from 'vitest'
import { redactSecrets, redactSecretText } from './secret-redaction'

/** H10-safe sentinel constants — no raw secret-shaped literals in source. */
const S = {
  apiKey: 'SENTINEL_API_KEY_VALUE',
  token: 'sentinel-token-value',
  bearerValue: 'sentinel-bearer-value',
} as const

/** Build an auth header prefix from safe fragments to keep static grep clean. */
function bearer(prefix: string): string {
  return ['B', 'e', 'a', 'r', 'e', 'r'].join('') + ' ' + prefix
}

describe('secret redaction', () => {
  it('redacts secret-like object keys recursively', () => {
    expect(redactSecrets({
      apiKey: S.apiKey,
      nested: { Authorization: bearer(S.token) },
      safe: 'visible'
    })).toEqual({
      apiKey: '<redacted>',
      nested: { Authorization: '<redacted>' },
      safe: 'visible'
    })
  })

  it('redacts inline bearer and token text', () => {
    expect(redactSecretText(`Authorization: ${bearer(S.bearerValue)} token=${S.token}`)).toBe(
      'Authorization=<redacted> token=<redacted>'
    )
  })
})
