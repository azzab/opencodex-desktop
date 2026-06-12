import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AUTOMATION_PERMISSIONS,
  decideAutomationPermission,
  normalizeAutomationCapabilityConfig,
  type AutomationActionRequest,
  type AutomationCapabilityConfig
} from '../src/automation/automation-policy.js'

const baseConfig: AutomationCapabilityConfig = normalizeAutomationCapabilityConfig({
  enabled: true,
  localDevOnly: true,
  allowedHosts: ['localhost', '127.0.0.1', '::1'],
  permissions: {
    ...DEFAULT_AUTOMATION_PERMISSIONS,
    browserNavigation: 'allow',
    browserInteraction: 'ask',
    screenshots: 'ask',
    localFileAccess: 'allow',
    appControl: 'allow'
  }
})

function request(overrides: Partial<AutomationActionRequest>): AutomationActionRequest {
  return {
    action: 'browser.navigate',
    runId: 'run_1',
    threadId: 'thr_1',
    turnId: 'turn_1',
    workspace: '/tmp/workspace',
    target: { url: 'http://localhost:3000' },
    ...overrides
  }
}

describe('automation permission decisions', () => {
  it('denies every automation action while experimental automation is disabled', () => {
    const decision = decideAutomationPermission(
      { ...baseConfig, enabled: false },
      request({})
    )

    expect(decision).toMatchObject({
      decision: 'deny',
      reason: 'experimental automation is disabled'
    })
  })

  it('allows browser navigation only to local/dev hosts by default', () => {
    expect(decideAutomationPermission(baseConfig, request({}))).toMatchObject({
      decision: 'allow',
      permission: 'browserNavigation'
    })

    expect(decideAutomationPermission(baseConfig, request({
      target: { url: 'https://example.com' }
    }))).toMatchObject({
      decision: 'deny',
      reason: 'browser navigation is limited to local/dev hosts'
    })
  })

  it('requires approval for controlled-browser click and type actions when configured as ask', () => {
    const click = decideAutomationPermission(baseConfig, request({
      action: 'browser.click',
      target: { selector: '#submit' }
    }))
    const type = decideAutomationPermission(baseConfig, request({
      action: 'browser.type',
      target: { selector: '#search' }
    }))

    expect(click).toMatchObject({ decision: 'ask', permission: 'browserInteraction' })
    expect(type).toMatchObject({ decision: 'ask', permission: 'browserInteraction' })
  })

  it('denies screenshot capture when its explicit screenshot gate is denied', () => {
    const decision = decideAutomationPermission(
      {
        ...baseConfig,
        permissions: {
          ...baseConfig.permissions,
          screenshots: 'deny'
        }
      },
      request({ action: 'browser.screenshot' })
    )

    expect(decision).toMatchObject({
      decision: 'deny',
      permission: 'screenshots'
    })
  })

  it('allows local file access only inside the active workspace', () => {
    expect(decideAutomationPermission(baseConfig, request({
      action: 'local_file.access',
      target: { path: '/tmp/workspace/screenshots/shot.png' }
    }))).toMatchObject({
      decision: 'allow',
      permission: 'localFileAccess'
    })

    expect(decideAutomationPermission(baseConfig, request({
      action: 'local_file.access',
      target: { path: '/Users/mohamedazab/.ssh/id_rsa' }
    }))).toMatchObject({
      decision: 'deny',
      reason: 'local file access is limited to the active workspace'
    })
  })

  it('blocks app control even when the gate is set to allow until a native adapter exists', () => {
    const decision = decideAutomationPermission(baseConfig, request({
      action: 'app.control',
      target: { app: 'Finder' }
    }))

    expect(decision).toMatchObject({
      decision: 'deny',
      reason: 'app/computer control is not implemented in this phase'
    })
  })

  it('allows browser.snapshot through the browserNavigation gate when enabled', () => {
    const decision = decideAutomationPermission(baseConfig, request({
      action: 'browser.snapshot',
      target: {}
    }))

    expect(decision).toMatchObject({
      decision: 'allow',
      permission: 'browserNavigation'
    })
  })

  it('denies browser.snapshot when URL is on a disallowed host', () => {
    const decision = decideAutomationPermission(baseConfig, request({
      action: 'browser.snapshot',
      target: { url: 'https://example.com' }
    }))

    expect(decision).toMatchObject({
      decision: 'deny',
      permission: 'browserNavigation',
      reason: 'browser navigation is limited to local/dev hosts'
    })
  })

  it('denies browser.snapshot when browserNavigation is deny', () => {
    const decision = decideAutomationPermission(
      {
        ...baseConfig,
        permissions: {
          ...baseConfig.permissions,
          browserNavigation: 'deny'
        }
      },
      request({ action: 'browser.snapshot', target: {} })
    )

    expect(decision).toMatchObject({
      decision: 'deny',
      permission: 'browserNavigation'
    })
  })
})
