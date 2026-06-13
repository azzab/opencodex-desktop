import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const readiness = require('../../scripts/release-readiness.cjs')

function readyEnv(): Record<string, string> {
  return {
    CSC_LINK: '/private/certs/developer-id.p12',
    CSC_KEY_PASSWORD: 'fixture-cert-password',
    APPLE_API_KEY: '/private/certs/AuthKey_ABC123.p8',
    APPLE_API_KEY_ID: 'ABC123',
    APPLE_API_ISSUER: 'fixture-issuer-value',
    R2_BUCKET: 'opencodex-desktop',
    R2_ENDPOINT: 'https://example.invalid',
    R2_ACCESS_KEY_ID: 'fixture-access-value',
    R2_SECRET_ACCESS_KEY: 'fixture-r2-value',
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
    expect(serialized).not.toContain('fixture-cert')
    expect(serialized).not.toContain('fixture-access')
    expect(serialized).not.toContain('fixture-r2-value')
    expect(serialized).not.toContain('/private/certs')
    expect(serialized).not.toContain('fixture-issuer')
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

  it('only checks the requested platform artifacts (no cross-contamination)', () => {
    // Check artifact ID lists, not presence.  Per-platform isolation is
    // about which artifacts are *checked*, regardless of whether they exist.
    const macReport = readiness.createReleaseReadinessReport({
      env: readyEnv(),
      platform: 'mac',
      artifactOnly: true,
      artifactExists: () => false
    })
    const macIds = macReport.checks.artifacts.map((a: { id: string }) => a.id)
    expect(macIds).toContain('macArm64Executable')
    expect(macIds).not.toContain('winInstallerExe')
    expect(macIds).not.toContain('linuxAppImage')

    const winReport = readiness.createReleaseReadinessReport({
      env: readyEnv(),
      platform: 'win',
      artifactOnly: true,
      artifactExists: () => false
    })
    const winIds = winReport.checks.artifacts.map((a: { id: string }) => a.id)
    expect(winIds).toContain('winInstallerExe')
    expect(winIds).toContain('winInstallerBlockmap')
    expect(winIds).toContain('winLatestYml')
    expect(winIds).not.toContain('macArm64Executable')
    expect(winIds).not.toContain('linuxAppImage')

    const linuxReport = readiness.createReleaseReadinessReport({
      env: readyEnv(),
      platform: 'linux',
      artifactOnly: true,
      artifactExists: () => false
    })
    const linuxIds = linuxReport.checks.artifacts.map((a: { id: string }) => a.id)
    expect(linuxIds).toContain('linuxAppImage')
    expect(linuxIds).toContain('linuxAppImageBlockmap')
    expect(linuxIds).toContain('linuxLatestYml')
    expect(linuxIds).not.toContain('macArm64Executable')
    expect(linuxIds).not.toContain('winInstallerExe')
  })

  it('artifact-only mode skips operator gates, credentials, and v0.3.0 gates', () => {
    const report = readiness.createReleaseReadinessReport({
      env: {}, // No operator env vars set
      platform: 'mac',
      artifactOnly: true,
      // All mac artifacts are non-glob, so artifactExists controls presence
      artifactExists: () => true,
      v030Evidence: missingV030Evidence() // v0.3.0 evidence missing
    })

    expect(report.status).toBe('ready')
    expect(report.blockers).toEqual([])
    expect(report.checks.operator).toEqual([])
    expect(report.checks.credentials).toEqual({ macSigning: [], r2: [] })
    expect(report.checks.v030).toEqual([])
    expect(report.target).toContain('packaging-artifact-check')
  })

  it('artifact-only mode blocks when platform artifact is missing', () => {
    // Use mac platform (non-glob artifacts) so artifactExists mock controls
    // every artifact's presence deterministically.
    // Path for macArm64Executable includes /MacOS/ in the bundle structure.
    const mockExists = (absPath: string) => !absPath.includes('/MacOS/')
    const report = readiness.createReleaseReadinessReport({
      env: readyEnv(),
      platform: 'mac',
      artifactOnly: true,
      artifactExists: mockExists
    })

    expect(report.status).toBe('blocked')
    expect(report.blockers).toContain('missing_artifact:macArm64Executable')
    // Other artifacts (e.g. the .asar) have a different path and should be present
    expect(report.blockers).not.toContain('missing_artifact:macArm64AppAsar')
    // No operator/v030 blockers leak through
    expect(report.blockers.every((b: string) => b.startsWith('missing_artifact:'))).toBe(true)
  })

  it('strict mode with artifact-only exits non-zero when blocked', () => {
    const log = vi.fn()
    const error = vi.fn()
    const processLike = { env: {}, cwd: () => '/repo', exitCode: 0 }

    readiness.runCli(
      ['--platform', 'mac', '--artifact-only', '--strict', '--json'],
      { log, error },
      processLike,
      { artifactExists: () => false }
    )

    expect(processLike.exitCode).toBe(1)
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
