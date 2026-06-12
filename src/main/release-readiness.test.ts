import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const readiness = require('../../scripts/release-readiness.cjs')

function readyEnv(): Record<string, string> {
  return {
    CSC_LINK: '/private/certs/developer-id.p12',
    CSC_KEY_PASSWORD: 'super-secret-cert-password',
    APPLE_API_KEY: '/private/certs/AuthKey_ABC123.p8',
    APPLE_API_KEY_ID: 'ABC123',
    APPLE_API_ISSUER: 'issuer-secret',
    R2_BUCKET: 'opencodex-desktop',
    R2_ENDPOINT: 'https://example.invalid',
    R2_ACCESS_KEY_ID: 'access-secret',
    R2_SECRET_ACCESS_KEY: 'secret-secret',
    R2_PUBLIC_BASE_URL: 'https://downloads.example.invalid',
    OPENCODEX_RELEASE_OPERATOR_APPROVED: '1',
    OPENCODEX_RELEASE_MAC_SIGNING_DECISION: 'signed-notarized',
    OPENCODEX_RELEASE_MANUAL_PACKAGED_SMOKE: '1',
    OPENCODEX_RELEASE_LIVE_PROVIDER_SMOKE: '1',
    OPENCODEX_RELEASE_ARABIC_SCOPE: 'partial-beta',
    OPENCODEX_RELEASE_UPDATE_ROLLBACK_NOTES: '1',
    OPENCODEX_RELEASE_PUBLISH_AUTHORIZED: '1'
  }
}

function readyV030Evidence(): Record<string, boolean> {
  return {
    packageVersion: true,
    h12ReadinessReport: true,
    v030OperatorRunbook: true,
    newSurfaceSecurityReview: true,
    arabicParityReverified: true
  }
}

function missingV030Evidence(): Record<string, boolean> {
  return Object.fromEntries(
    Object.keys(readyV030Evidence()).map((key) => [key, false])
  )
}

describe('release readiness report', () => {
  it('reports secret key presence without exposing secret values', () => {
    const report = readiness.createReleaseReadinessReport({
      env: readyEnv(),
      artifactExists: () => true,
      v030Evidence: readyV030Evidence()
    })

    const serialized = JSON.stringify(report)

    expect(serialized).toContain('"CSC_LINK"')
    expect(serialized).toContain('"present":true')
    expect(serialized).not.toContain('super-secret')
    expect(serialized).not.toContain('access-secret')
    expect(serialized).not.toContain('secret-secret')
    expect(serialized).not.toContain('/private/certs')
    expect(serialized).not.toContain('issuer-secret')
  })

  it('blocks release authorization when operator-only gates are missing', () => {
    const report = readiness.createReleaseReadinessReport({
      env: {},
      artifactExists: () => false,
      v030Evidence: missingV030Evidence()
    })

    expect(report.status).toBe('blocked')
    expect(report.blockers).toEqual(expect.arrayContaining([
      'missing_operator_release_approval',
      'missing_mac_signing_or_unsigned_beta_decision',
      'missing_manual_packaged_app_smoke',
      'missing_live_provider_smoke',
      'missing_arabic_release_scope_decision',
      'missing_update_rollback_notes',
      'missing_publish_authorization',
      'missing_v030_rc_version',
      'missing_h12_readiness_report',
      'missing_v030_operator_runbook',
      'missing_new_surface_security_review',
      'missing_arabic_parity_reverification'
    ]))
    expect(report.blockers.some((blocker: string) => blocker.startsWith('missing_artifact:'))).toBe(true)
  })

  it('marks readiness as ready when all local and operator gates are present', () => {
    const report = readiness.createReleaseReadinessReport({
      env: readyEnv(),
      artifactExists: () => true,
      v030Evidence: readyV030Evidence()
    })

    expect(report.status).toBe('ready')
    expect(report.blockers).toEqual([])
  })

  it('prints blocked reports without failing unless strict mode is requested', () => {
    const log = vi.fn()
    const error = vi.fn()
    const processLike = { env: {}, cwd: () => '/repo', exitCode: 0 }

    const defaultResult = readiness.runCli([], { log, error }, processLike, {
      artifactExists: () => false,
      v030Evidence: missingV030Evidence()
    })
    expect(defaultResult.status).toBe('blocked')
    expect(processLike.exitCode).toBe(0)
    expect(error).not.toHaveBeenCalled()

    const strictProcess = { env: {}, cwd: () => '/repo', exitCode: 0 }
    const strictResult = readiness.runCli(
      ['--strict'],
      { log, error },
      strictProcess,
      { artifactExists: () => false, v030Evidence: missingV030Evidence() }
    )

    expect(strictResult.status).toBe('blocked')
    expect(strictProcess.exitCode).toBe(1)
  })

  it('keeps strict mode green when every gate is ready', () => {
    const log = vi.fn()
    const error = vi.fn()
    const processLike = { env: readyEnv(), cwd: () => '/repo', exitCode: 0 }

    const result = readiness.runCli(
      ['--strict', '--json'],
      { log, error },
      processLike,
      { artifactExists: () => true, v030Evidence: readyV030Evidence() }
    )

    expect(result.status).toBe('ready')
    expect(processLike.exitCode).toBe(0)
    expect(error).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"status": "ready"'))
    expect(log).toHaveBeenCalledWith(expect.stringContaining('opencodex-desktop-v0.3.0-rc-release-readiness'))
  })

  it('reports v0.3.0 local evidence gate status without operator secrets', () => {
    const report = readiness.createReleaseReadinessReport({
      env: readyEnv(),
      artifactExists: () => true,
      v030Evidence: {
        packageVersion: true,
        h12ReadinessReport: true,
        v030OperatorRunbook: true,
        newSurfaceSecurityReview: false,
        arabicParityReverified: false
      }
    })

    expect(report.status).toBe('blocked')
    expect(report.blockers).toEqual(expect.arrayContaining([
      'missing_new_surface_security_review',
      'missing_arabic_parity_reverification'
    ]))
    expect(report.checks.v030).toContainEqual(expect.objectContaining({
      id: 'packageVersion',
      ready: true,
      expected: '0.3.0-rc'
    }))
  })
})
