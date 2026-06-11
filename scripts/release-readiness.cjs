#!/usr/bin/env node

const { accessSync, constants, existsSync } = require('node:fs')
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

function artifactStatus(root, artifactExists = defaultArtifactExists) {
  const resolvedRoot = root || process.cwd()
  return MAC_ARM64_ARTIFACTS.map((artifact) => {
    const absolutePath = resolve(resolvedRoot, artifact.path)
    const present = Boolean(artifactExists(absolutePath, artifact))
    return {
      id: artifact.id,
      path: artifact.path,
      executable: Boolean(artifact.executable),
      present,
      blocker: present ? undefined : `missing_artifact:${artifact.id}`
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
  const report = {
    version: 1,
    target: 'deepseek-gui-v0.2.8-local-release-authorization',
    status: 'blocked',
    generatedAt: options.generatedAt || new Date().toISOString(),
    checks: {
      operator: operatorGateStatus(env),
      credentials: {
        macSigning: groupPresence(env, MAC_SIGNING_GROUPS),
        r2: groupPresence(env, R2_GROUPS)
      },
      artifacts: artifactStatus(root, options.artifactExists)
    },
    blockers: [],
    warnings: []
  }

  Object.defineProperty(report, 'envSnapshot', {
    value: env,
    enumerable: false
  })

  const classification = classifyReleaseReadiness(report)
  report.status = classification.status
  report.blockers = classification.blockers
  report.warnings = classification.warnings
  return report
}

function parseArgs(argv) {
  const flags = {
    json: false,
    strict: false,
    help: false
  }

  for (const arg of argv) {
    if (arg === '--json') flags.json = true
    if (arg === '--strict') flags.strict = true
    if (arg === '--help' || arg === '-h') flags.help = true
  }

  return flags
}

function usage() {
  return `Usage:
  npm run release:readiness -- [--json] [--strict]

This command is read-only. It reports release gate presence without printing
credential values, creating tags, uploading artifacts, or promoting channels.

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
  lines.push('Package artifacts:')
  for (const artifact of report.checks.artifacts) {
    lines.push(`  ${artifact.present ? 'ok' : 'missing'} ${artifact.path}`)
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
    artifactExists: options.artifactExists,
    generatedAt: options.generatedAt
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
  artifactStatus,
  classifyReleaseReadiness,
  createReleaseReadinessReport,
  defaultArtifactExists,
  formatTextReport,
  groupPresence,
  keyPresence,
  parseArgs,
  runCli
}

if (require.main === module) {
  runCli()
}
