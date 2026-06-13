#!/usr/bin/env node

const { accessSync, constants, existsSync, readFileSync } = require('node:fs')
const { resolve } = require('node:path')

const OPERATOR_GATES = [
  {
    id: 'releaseOperatorApproved',
    key: 'OPENCODEX_RELEASE_OPERATOR_APPROVED',
    blocker: 'missing_operator_release_approval',
    isReady: (value) => value === '1'
  },
  {
    id: 'macSigningDecision',
    key: 'OPENCODEX_RELEASE_MAC_SIGNING_DECISION',
    blocker: 'missing_mac_signing_or_unsigned_beta_decision',
    acceptedValues: ['signed-notarized', 'unsigned-local-beta'],
    isReady: (value) => value === 'signed-notarized' || value === 'unsigned-local-beta'
  },
  {
    id: 'manualPackagedSmoke',
    key: 'OPENCODEX_RELEASE_MANUAL_PACKAGED_SMOKE',
    blocker: 'missing_manual_packaged_app_smoke',
    isReady: (value) => value === '1'
  },
  {
    id: 'liveProviderSmoke',
    key: 'OPENCODEX_RELEASE_LIVE_PROVIDER_SMOKE',
    blocker: 'missing_live_provider_smoke',
    isReady: (value) => value === '1'
  },
  {
    id: 'arabicReleaseScope',
    key: 'OPENCODEX_RELEASE_ARABIC_SCOPE',
    blocker: 'missing_arabic_release_scope_decision',
    acceptedValues: ['complete', 'partial-beta'],
    isReady: (value) => value === 'complete' || value === 'partial-beta'
  },
  {
    id: 'updateRollbackNotes',
    key: 'OPENCODEX_RELEASE_UPDATE_ROLLBACK_NOTES',
    blocker: 'missing_update_rollback_notes',
    isReady: (value) => value === '1'
  },
  {
    id: 'publishAuthorization',
    key: 'OPENCODEX_RELEASE_PUBLISH_AUTHORIZED',
    blocker: 'missing_publish_authorization',
    isReady: (value) => value === '1'
  }
]

const MAC_SIGNING_GROUPS = [
  {
    id: 'certificate',
    keys: ['CSC_LINK', 'MAC_CODESIGN_P12_PATH', 'MAC_CODESIGN_P12_BASE64']
  },
  {
    id: 'certificatePassword',
    keys: ['CSC_KEY_PASSWORD', 'MAC_CODESIGN_P12_PASSWORD', 'P12_PASSWORD']
  },
  {
    id: 'notaryKey',
    keys: ['APPLE_API_KEY', 'APPLE_API_KEY_BASE64', 'P8_PATH']
  },
  {
    id: 'notaryKeyId',
    keys: ['APPLE_API_KEY_ID', 'KEY_ID']
  },
  {
    id: 'notaryIssuer',
    keys: ['APPLE_API_ISSUER', 'ISSUER']
  }
]

const R2_GROUPS = [
  {
    id: 'bucket',
    keys: ['R2_BUCKET', 'S3_BUCKET']
  },
  {
    id: 'endpoint',
    keys: ['R2_ENDPOINT', 'S3_ENDPOINT', 'R2_ACCOUNT_ID']
  },
  {
    id: 'accessKeyId',
    keys: ['R2_ACCESS_KEY_ID', 'S3_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID']
  },
  {
    id: 'secretAccessKey',
    keys: ['R2_SECRET_ACCESS_KEY', 'S3_SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY']
  },
  {
    id: 'publicBaseUrl',
    keys: ['R2_PUBLIC_BASE_URL', 'PUBLIC_DOWNLOAD_BASE_URL']
  }
]

const MAC_ARM64_ARTIFACTS = [
  {
    id: 'macArm64Executable',
    path: 'dist/mac-arm64/OpenCodex Desktop.app/Contents/MacOS/OpenCodex Desktop',
    executable: true
  },
  {
    id: 'macArm64AppAsar',
    path: 'dist/mac-arm64/OpenCodex Desktop.app/Contents/Resources/app.asar'
  },
  {
    id: 'kunServeEntry',
    path: 'dist/mac-arm64/OpenCodex Desktop.app/Contents/Resources/app.asar.unpacked/kun/dist/cli/serve-entry.js'
  },
  {
    id: 'kunPackageManifest',
    path: 'dist/mac-arm64/OpenCodex Desktop.app/Contents/Resources/app.asar.unpacked/kun/package.json'
  },
  {
    id: 'kunPackageLock',
    path: 'dist/mac-arm64/OpenCodex Desktop.app/Contents/Resources/app.asar.unpacked/kun/package-lock.json'
  },
  {
    id: 'kunZodDependency',
    path: 'dist/mac-arm64/OpenCodex Desktop.app/Contents/Resources/app.asar.unpacked/kun/node_modules/zod/package.json'
  },
  {
    id: 'kunDiffDependency',
    path: 'dist/mac-arm64/OpenCodex Desktop.app/Contents/Resources/app.asar.unpacked/kun/node_modules/diff/package.json'
  },
  {
    id: 'kunMcpSdkDependency',
    path: 'dist/mac-arm64/OpenCodex Desktop.app/Contents/Resources/app.asar.unpacked/kun/node_modules/@modelcontextprotocol/sdk/package.json'
  },
  {
    id: 'rootBetterSqliteDependency',
    path: 'dist/mac-arm64/OpenCodex Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/better-sqlite3/package.json'
  }
]

/**
 * Windows NSIS installer artifacts (checked on Windows or when the .exe is present).
 * The glob-style path means any matching installer counts.
 * The yml artifact uses a wildcard because electron-builder names it after the
 * update channel (latest.yml for stable, beta.yml for -beta, alpha.yml for -alpha).
 */
const WIN_NSIS_ARTIFACTS = [
  {
    id: 'winInstallerExe',
    path: 'dist/OpenCodex-Desktop-*-win-x64.exe',
    glob: true
  },
  {
    id: 'winInstallerBlockmap',
    path: 'dist/OpenCodex-Desktop-*-win-x64.exe.blockmap',
    glob: true
  },
  {
    id: 'winLatestYml',
    path: 'dist/{latest,beta,alpha}.yml',
    glob: true
  }
]

/**
 * Linux AppImage artifacts (checked on Linux or when the .AppImage is present).
 * The yml artifact uses a wildcard to match the update-channel-based name
 * (latest-linux.yml for stable, beta-linux.yml for pre-release, etc.).
 */
const LINUX_APPIMAGE_ARTIFACTS = [
  {
    id: 'linuxAppImage',
    path: 'dist/OpenCodex-Desktop-*-linux-x86_64.AppImage',
    glob: true
  },
  {
    id: 'linuxAppImageBlockmap',
    path: 'dist/OpenCodex-Desktop-*-linux-x86_64.AppImage.blockmap',
    glob: true
  },
  {
    id: 'linuxLatestYml',
    path: 'dist/{latest,beta,alpha}-linux.yml',
    glob: true
  }
]

const PLATFORM_ARTIFACT_MAP = {
  mac: MAC_ARM64_ARTIFACTS,
  'mac-arm64': MAC_ARM64_ARTIFACTS,
  win: WIN_NSIS_ARTIFACTS,
  'win-x64': WIN_NSIS_ARTIFACTS,
  linux: LINUX_APPIMAGE_ARTIFACTS,
  'linux-x64': LINUX_APPIMAGE_ARTIFACTS
}

const V030_LOCAL_GATES = [
  {
    id: 'packageVersion',
    blocker: 'missing_v030_rc_version',
    expected: '0.3.0-rc'
  },
  {
    id: 'h12ReadinessReport',
    blocker: 'missing_h12_readiness_report',
    path: 'docs/PHASE_H12_PARITY_RELEASE_V030_REPORT.md'
  },
  {
    id: 'v030OperatorRunbook',
    blocker: 'missing_v030_operator_runbook',
    path: 'docs/release/0.3.0-operator-runbook.md'
  },
  {
    id: 'newSurfaceSecurityReview',
    blocker: 'missing_new_surface_security_review',
    path: 'docs/PHASE_H12_PARITY_RELEASE_V030_REPORT.md',
    marker: 'Zero unpatched fix-now security findings'
  },
  {
    id: 'arabicParityReverified',
    blocker: 'missing_arabic_parity_reverification',
    path: 'docs/PHASE_H12_PARITY_RELEASE_V030_REPORT.md',
    marker: 'src/renderer/src/locales/locale-coverage.test.ts'
  }
]

function envValue(env, key) {
  const value = env?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

function keyPresence(env, keys) {
  return keys.map((key) => ({
    key,
    present: Boolean(envValue(env, key))
  }))
}

function groupPresence(env, groups) {
  return groups.map((group) => {
    const keys = keyPresence(env, group.keys)
    return {
      id: group.id,
      keys,
      present: keys.some((entry) => entry.present)
    }
  })
}

function operatorGateStatus(env) {
  return OPERATOR_GATES.map((gate) => {
    const rawValue = envValue(env, gate.key)
    const ready = gate.isReady(rawValue)
    return {
      id: gate.id,
      key: gate.key,
      present: Boolean(rawValue),
      ready,
      acceptedValues: gate.acceptedValues || undefined,
      blocker: ready ? undefined : gate.blocker
    }
  })
}

function defaultArtifactExists(absolutePath, artifact) {
  if (!existsSync(absolutePath)) {
    return false
  }

  if (!artifact.executable) {
    return true
  }

  try {
    accessSync(absolutePath, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Check whether a glob-style artifact path matches at least one file.
 * Falls back to an exact-path check when the glob contains no wildcards.
 */
function globArtifactExists(resolvedRoot, pattern, artifactExistsFn) {
  const { globSync } = (function loadGlob() {
    try {
      return require('glob')
    } catch {
      // glob is not a direct dependency — use a simple fs-based fallback
      return { globSync: null }
    }
  })()

  if (!pattern.includes('*')) {
    return artifactExistsFn(resolve(resolvedRoot, pattern), {})
  }

  if (globSync) {
    try {
      const matches = globSync(pattern, { cwd: resolvedRoot, nodir: true })
      return matches.length > 0
    } catch {
      return false
    }
  }

  // Fallback: check if the directory exists and try a simple readdir match.
  // The pattern may include a directory prefix (e.g. "dist/").  readdirSync
  // returns bare filenames, so we strip the dir prefix from the pattern and
  // match only the basename against directory entries.
  const { readdirSync, existsSync: fsExistsSync } = require('node:fs')
  const { basename } = require('node:path')
  const dirPath = resolve(resolvedRoot, 'dist')
  if (!fsExistsSync(dirPath)) return false
  try {
    const entries = readdirSync(dirPath)
    const namePattern = basename(pattern)
    // Convert glob to regex:
    // 1. Escape regex-special chars (except *, {, } which are glob operators)
    // 2. Handle brace expansion: {a,b,c} → (a|b|c)
    // 3. Convert glob * to regex .*
    let escaped = namePattern
      .replace(/[.+^$()|[\]\\]/g, '\\$&')
      .replace(/\{([^{}]+)\}/g, (_, inner) => `(${inner.replace(/,/g, '|')})`)
      .replace(/\*/g, '.*')
    const re = new RegExp('^' + escaped + '$')
    return entries.some((entry) => re.test(entry))
  } catch {
    return false
  }
}

function artifactStatus(root, artifactExists = defaultArtifactExists, platform) {
  const resolvedRoot = root || process.cwd()
  // When a platform is explicitly requested, only check that platform's
  // artifacts.  Without a platform flag, default to mac-arm64 only
  // (backward-compat).  Never mix unrelated platform artifacts unless
  // the caller explicitly passes --platform for each platform.
  const artifacts = platform
    ? (PLATFORM_ARTIFACT_MAP[platform] || [])
    : MAC_ARM64_ARTIFACTS
  return artifacts.map((artifact) => {
    let present
    if (artifact.glob) {
      present = globArtifactExists(resolvedRoot, artifact.path, artifactExists)
    } else {
      const absolutePath = resolve(resolvedRoot, artifact.path)
      present = Boolean(artifactExists(absolutePath, artifact))
    }
    return {
      id: artifact.id,
      path: artifact.path,
      executable: Boolean(artifact.executable),
      glob: Boolean(artifact.glob),
      present,
      platform: platform || undefined,
      blocker: present ? undefined : `missing_artifact:${artifact.id}`
    }
  })
}

function defaultReadText(absolutePath) {
  return readFileSync(absolutePath, 'utf-8')
}

function packageVersionStatus(root, options = {}) {
  const readText = options.readText || defaultReadText
  const packageJsonPath = resolve(root || process.cwd(), 'package.json')
  try {
    const parsed = JSON.parse(readText(packageJsonPath))
    return typeof parsed.version === 'string' ? parsed.version : ''
  } catch {
    return ''
  }
}

function v030GateStatus(root, options = {}) {
  const resolvedRoot = root || process.cwd()
  const readText = options.readText || defaultReadText
  const evidence = options.v030Evidence || {}
  const packageVersion = options.packageVersion || packageVersionStatus(resolvedRoot, { readText })

  return V030_LOCAL_GATES.map((gate) => {
    if (Object.prototype.hasOwnProperty.call(evidence, gate.id)) {
      const ready = evidence[gate.id] === true
      return {
        id: gate.id,
        ready,
        expected: gate.expected,
        path: gate.path,
        marker: gate.marker,
        blocker: ready ? undefined : gate.blocker
      }
    }

    let ready = false
    if (gate.id === 'packageVersion') {
      ready = packageVersion === gate.expected
    } else if (gate.path) {
      const absolutePath = resolve(resolvedRoot, gate.path)
      if (existsSync(absolutePath)) {
        if (gate.marker) {
          try {
            ready = readText(absolutePath).includes(gate.marker)
          } catch {
            ready = false
          }
        } else {
          ready = true
        }
      }
    }

    return {
      id: gate.id,
      ready,
      expected: gate.expected,
      path: gate.path,
      marker: gate.marker,
      blocker: ready ? undefined : gate.blocker
    }
  })
}

function allGroupsPresent(groups) {
  return groups.every((group) => group.present)
}

function classifyReleaseReadiness(report) {
  const blockers = []
  const warnings = []

  for (const gate of report.checks.operator) {
    if (!gate.ready && gate.blocker) {
      blockers.push(gate.blocker)
    }
  }

  for (const artifact of report.checks.artifacts) {
    if (!artifact.present && artifact.blocker) {
      blockers.push(artifact.blocker)
    }
  }

  for (const gate of report.checks.v030) {
    if (!gate.ready && gate.blocker) {
      blockers.push(gate.blocker)
    }
  }

  const macSigningDecision = envValue(report.envSnapshot, 'OPENCODEX_RELEASE_MAC_SIGNING_DECISION')
  if (macSigningDecision === 'signed-notarized' && !allGroupsPresent(report.checks.credentials.macSigning)) {
    blockers.push('missing_apple_signing_credentials')
  }
  if (macSigningDecision === 'unsigned-local-beta') {
    warnings.push('unsigned_local_beta_requires_explicit_release_notes')
  }

  const publishAuthorized = envValue(report.envSnapshot, 'OPENCODEX_RELEASE_PUBLISH_AUTHORIZED') === '1'
  if (publishAuthorized && !allGroupsPresent(report.checks.credentials.r2)) {
    blockers.push('missing_r2_release_credentials')
  }

  return {
    status: blockers.length === 0 ? 'ready' : 'blocked',
    blockers,
    warnings
  }
}

function createReleaseReadinessReport(options = {}) {
  const env = options.env || process.env
  const root = options.root || process.cwd()
  const platform = options.platform || process.platform
  const artifactOnly = Boolean(options.artifactOnly)

  // --artifact-only mode: check ONLY packaging artifacts for the
  // requested platform.  No operator gates, no v0.3.0 local evidence,
  // no credential presence checks.  Designed for CI packaging-job
  // stop gates where the only question is "did the native build produce
  // the expected platform artifact?".
  const checks = {
    operator: artifactOnly ? [] : operatorGateStatus(env),
    credentials: artifactOnly
      ? { macSigning: [], r2: [] }
      : {
          macSigning: groupPresence(env, MAC_SIGNING_GROUPS),
          r2: groupPresence(env, R2_GROUPS)
        },
    artifacts: artifactStatus(root, options.artifactExists, options.platform),
    v030: artifactOnly ? [] : v030GateStatus(root, options)
  }

  const report = {
    version: 1,
    target: artifactOnly
      ? `opencodex-desktop-packaging-artifact-check:${options.platform || platform}`
      : 'opencodex-desktop-v0.3.0-rc-release-readiness',
    status: 'blocked',
    generatedAt: options.generatedAt || new Date().toISOString(),
    platform,
    checks,
    blockers: [],
    warnings: []
  }

  Object.defineProperty(report, 'envSnapshot', {
    value: env,
    enumerable: false
  })

  if (artifactOnly) {
    // In artifact-only mode, readiness is purely about artifact presence.
    const missingArtifacts = checks.artifacts.filter((a) => !a.present)
    report.status = missingArtifacts.length === 0 ? 'ready' : 'blocked'
    report.blockers = missingArtifacts.map((a) => a.blocker).filter(Boolean)
  } else {
    const classification = classifyReleaseReadiness(report)
    report.status = classification.status
    report.blockers = classification.blockers
    report.warnings = classification.warnings
  }
  return report
}

function parseArgs(argv) {
  const flags = {
    json: false,
    strict: false,
    help: false,
    platform: null,
    artifactOnly: false
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--json') flags.json = true
    if (arg === '--strict') flags.strict = true
    if (arg === '--help' || arg === '-h') flags.help = true
    if (arg === '--artifact-only') flags.artifactOnly = true
    if ((arg === '--platform' || arg === '-p') && i + 1 < argv.length) {
      flags.platform = argv[i + 1]
      i++
    }
  }

  return flags
}

function usage() {
  return `Usage:
  npm run release:readiness -- [--json] [--strict] [--platform mac|win|linux] [--artifact-only]

This command is read-only. It reports release gate presence without printing
credential values, creating tags, uploading artifacts, or promoting channels.

With --platform, artifact checks verify the platform-specific
packaging artifacts (NSIS .exe on win, AppImage on linux, .app on mac).
Only the requested platform's artifacts are checked — mac artifacts are
not mixed into win/linux checks.

With --artifact-only, the report skips operator gates, credential presence,
and v0.3.0 local evidence gates.  It checks ONLY packaging artifact presence
for the given --platform.  Use this in CI packaging jobs where the only
question is "did the build produce the expected platform artifact?".

v0.3.0 local evidence gates:
  package.json version is 0.3.0-rc
  docs/PHASE_H12_PARITY_RELEASE_V030_REPORT.md exists
  docs/release/0.3.0-operator-runbook.md exists
  H12 report records new-surface security review as done
  H12 report records Arabic parity re-verification evidence

Operator gate environment variables:
  OPENCODEX_RELEASE_OPERATOR_APPROVED=1
  OPENCODEX_RELEASE_MAC_SIGNING_DECISION=signed-notarized|unsigned-local-beta
  OPENCODEX_RELEASE_MANUAL_PACKAGED_SMOKE=1
  OPENCODEX_RELEASE_LIVE_PROVIDER_SMOKE=1
  OPENCODEX_RELEASE_ARABIC_SCOPE=complete|partial-beta
  OPENCODEX_RELEASE_UPDATE_ROLLBACK_NOTES=1
  OPENCODEX_RELEASE_PUBLISH_AUTHORIZED=1`
}

function formatTextReport(report) {
  const lines = []
  lines.push(`Release readiness target: ${report.target}`)
  lines.push(`Status: ${report.status}`)
  lines.push('')
  lines.push('Operator gates:')
  for (const gate of report.checks.operator) {
    lines.push(`  ${gate.ready ? 'ok' : 'missing'} ${gate.key}`)
  }
  lines.push('')
  lines.push('macOS signing key presence:')
  for (const group of report.checks.credentials.macSigning) {
    const keys = group.keys.map((entry) => `${entry.key}=${entry.present ? 'present' : 'missing'}`).join(', ')
    lines.push(`  ${group.id}: ${keys}`)
  }
  lines.push('')
  lines.push('R2 release key presence:')
  for (const group of report.checks.credentials.r2) {
    const keys = group.keys.map((entry) => `${entry.key}=${entry.present ? 'present' : 'missing'}`).join(', ')
    lines.push(`  ${group.id}: ${keys}`)
  }
  lines.push('')
  lines.push(`Package artifacts (platform: ${report.platform || 'mac-arm64'}):`)
  for (const artifact of report.checks.artifacts) {
    const platformLabel = artifact.platform ? ` [${artifact.platform}]` : ''
    lines.push(`  ${artifact.present ? 'ok' : 'missing'} ${artifact.path}${platformLabel}`)
  }
  lines.push('')
  lines.push('v0.3.0 local evidence:')
  for (const gate of report.checks.v030) {
    const detail = gate.path ? ` ${gate.path}` : gate.expected ? ` ${gate.expected}` : ''
    lines.push(`  ${gate.ready ? 'ok' : 'missing'} ${gate.id}${detail}`)
  }
  if (report.blockers.length > 0) {
    lines.push('')
    lines.push('Blockers:')
    for (const blocker of report.blockers) {
      lines.push(`  ${blocker}`)
    }
  }
  if (report.warnings.length > 0) {
    lines.push('')
    lines.push('Warnings:')
    for (const warning of report.warnings) {
      lines.push(`  ${warning}`)
    }
  }
  return lines.join('\n')
}

function runCli(argv = process.argv.slice(2), io = console, processLike = process, options = {}) {
  const flags = parseArgs(argv)
  if (flags.help) {
    io.log(usage())
    return null
  }

  const report = createReleaseReadinessReport({
    env: processLike.env || {},
    root: typeof processLike.cwd === 'function' ? processLike.cwd() : process.cwd(),
    platform: flags.platform || undefined,
    artifactOnly: flags.artifactOnly || undefined,
    artifactExists: options.artifactExists,
    generatedAt: options.generatedAt,
    packageVersion: options.packageVersion,
    readText: options.readText,
    v030Evidence: options.v030Evidence
  })

  if (flags.json) {
    io.log(JSON.stringify(report, null, 2))
  } else {
    io.log(formatTextReport(report))
  }

  processLike.exitCode = flags.strict && report.status !== 'ready' ? 1 : 0
  return report
}

module.exports = {
  MAC_ARM64_ARTIFACTS,
  MAC_SIGNING_GROUPS,
  OPERATOR_GATES,
  R2_GROUPS,
  V030_LOCAL_GATES,
  WIN_NSIS_ARTIFACTS,
  LINUX_APPIMAGE_ARTIFACTS,
  PLATFORM_ARTIFACT_MAP,
  artifactStatus,
  classifyReleaseReadiness,
  createReleaseReadinessReport,
  defaultArtifactExists,
  formatTextReport,
  globArtifactExists,
  groupPresence,
  keyPresence,
  packageVersionStatus,
  parseArgs,
  runCli,
  v030GateStatus
}

if (require.main === module) {
  runCli()
}
