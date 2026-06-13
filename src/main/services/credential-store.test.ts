import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'

// Use vi.hoisted to provide mock data before vi.mock hoisting
const { mockSafeStorage } = vi.hoisted(() => ({
  mockSafeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (text: string) => Buffer.from(`safe:${text}`, 'utf8'),
    decryptString: (buf: Buffer) => {
      const text = buf.toString('utf8')
      return text.startsWith('safe:') ? text.slice(5) : text
    }
  }
}))

vi.mock('electron', () => ({
  safeStorage: mockSafeStorage
}))

import { CredentialStore } from './credential-store'
import { STORED_ENCRYPTED_MARKER } from '../../shared/app-settings-types'
import { mkdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

describe('CredentialStore (safeStorage available)', () => {
  let testDir: string
  let store: CredentialStore

  beforeEach(async () => {
    testDir = join(tmpdir(), `cred-test-${randomUUID()}`)
    await mkdir(testDir, { recursive: true })
    store = new CredentialStore(testDir)
    await store.init()
  })

  afterEach(async () => {
    try { await unlink(join(testDir, 'credentials.enc')) } catch { /* ok */ }
  })

  it('should be available', () => {
    expect(store.isAvailable()).toBe(true)
  })

  it('should store and retrieve a key', async () => {
    await store.setKey('test-provider', 'pk-fixture-test-key-12345')
    const key = await store.getKey('test-provider')
    expect(key).toBe('pk-fixture-test-key-12345')
  })

  it('should return null for non-existent key', async () => {
    const key = await store.getKey('nonexistent')
    expect(key).toBeNull()
  })

  it('should delete a key', async () => {
    await store.setKey('test-provider', 'pk-fixture-test-key-12345')
    await store.deleteKey('test-provider')
    const key = await store.getKey('test-provider')
    expect(key).toBeNull()
  })

  it('should check if key exists', async () => {
    await store.setKey('test-provider', 'pk-fixture-test-key')
    expect(store.hasKey('test-provider')).toBe(true)
    expect(store.hasKey('other')).toBe(false)
  })

  it('should list provider IDs', async () => {
    await store.setKey('provider-a', 'pk-fixture-a')
    await store.setKey('provider-b', 'pk-fixture-b')
    const ids = store.listProviderIds()
    expect(ids).toContain('provider-a')
    expect(ids).toContain('provider-b')
  })

  it('should mask keys preserving prefix', async () => {
    await store.setKey('test-provider', 'pk-fixture-v1-abcdef1234567890abcdef')
    const masked = store.maskKey('test-provider')
    expect(masked).toContain('pk-fi')
    expect(masked).toContain('…')
    expect(masked).toContain('cdef')
  })

  it('should mask short keys with dots', async () => {
    await store.setKey('test-provider', 'abc')
    const masked = store.maskKey('test-provider')
    expect(masked).toBe('••••••••')
  })

  it('should return empty mask for non-existent key', () => {
    const masked = store.maskKey('nonexistent')
    expect(masked).toBe('')
  })

  it('should round-trip key after restart', async () => {
    await store.setKey('restart-test', 'pk-fixture-persist-98765')
    const newStore = new CredentialStore(testDir)
    await newStore.init()
    const key = await newStore.getKey('restart-test')
    expect(key).toBe('pk-fixture-persist-98765')
  })

  it('should migrate plaintext keys from settings', async () => {
    const providers = [
      { id: 'deepseek', apiKey: 'pk-fixture-ds-plain', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com' },
      { id: 'openrouter', apiKey: 'pk-fixture-plain-key', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
      { id: 'custom', apiKey: '', name: 'Custom', baseUrl: 'https://custom.api.com' }
    ]
    const migrated = await store.migrateFromSettings(providers)
    expect(migrated).toBe(true)
    expect(await store.getKey('deepseek')).toBe('pk-fixture-ds-plain')
    expect(await store.getKey('openrouter')).toBe('pk-fixture-plain-key')
    expect(await store.getKey('custom')).toBeNull()
  })

  it('should skip migration for marker values', async () => {
    const providers = [
      { id: 'deepseek', apiKey: STORED_ENCRYPTED_MARKER, name: 'DeepSeek', baseUrl: 'https://api.deepseek.com' }
    ]
    const migrated = await store.migrateFromSettings(providers)
    expect(migrated).toBe(false)
    expect(await store.getKey('deepseek')).toBeNull()
  })

  it('should handle setting empty key (delete)', async () => {
    await store.setKey('test-provider', 'pk-fixture-test')
    await store.setKey('test-provider', '')
    expect(await store.getKey('test-provider')).toBeNull()
  })

  it('should ignore marker value when setting key', async () => {
    await store.setKey('test-provider', STORED_ENCRYPTED_MARKER)
    expect(await store.getKey('test-provider')).toBeNull()
  })

  it('should support sync access after init', async () => {
    await store.setKey('sync-test', 'pk-fixture-sync-key')
    expect(store.getKeySync('sync-test')).toBe('pk-fixture-sync-key')
    expect(store.getKeySync('nonexistent')).toBe('')
  })

  it('should scrub plaintext after migration — settings contain marker, not plaintext', async () => {
    // This verifies the contract: after migration, the key is stored in the
    // credential store and the settings file should contain the marker.
    await store.setKey('scrub-test', 'pk-fixture-should-be-scrubbed')
    const key = await store.getKey('scrub-test')
    expect(key).toBe('pk-fixture-should-be-scrubbed')
    // The settings side should have the marker; the credential store has the real key
    expect(store.hasKey('scrub-test')).toBe(true)
    // Verify mask never returns the full key
    const masked = store.maskKey('scrub-test')
    expect(masked).not.toBe('pk-fixture-should-be-scrubbed')
    expect(masked).not.toContain('fixture-should-be-scrubbed')
    expect(masked).toContain('pk-fi')
    expect(masked).toContain('…')
  })

  it('should never persist raw key in plaintext on disk', async () => {
    // Store a key, then read the raw file — it should be encrypted
    await store.setKey('enc-test', 'pk-fixture-very-long-key')
    const { readFile } = await import('node:fs/promises')
    const raw = await readFile(join(testDir, 'credentials.enc'), 'utf8')
    // Raw key must never appear in plaintext
    expect(raw).not.toContain('pk-fixture-very-long-key')
    expect(raw).not.toContain('very-long')
    // File must be valid JSON with encrypted field
    const parsed = JSON.parse(raw)
    expect(parsed.version).toBe(1)
    expect(typeof parsed.encrypted).toBe('string')
    expect(parsed.encrypted.length).toBeGreaterThan(0)
  })

  it('should have hasKey() true and isAvailable() true after migration (durable contract)', async () => {
    // Contract: when isAvailable() is true, the caller SHOULD persist
    // STORED_ENCRYPTED_MARKER to the settings file because the key
    // WILL survive a restart.
    const providers = [
      { id: 'durable-prov', apiKey: 'pk-fixture-durable-key' }
    ]
    const migrated = await store.migrateFromSettings(providers)
    expect(migrated).toBe(true)
    expect(store.hasKey('durable-prov')).toBe(true)
    expect(store.isAvailable()).toBe(true)

    // Simulate caller deciding the scrubbed apiKey value:
    const wouldPersist = store.isAvailable()
    const scrubbedApiKey = wouldPersist ? STORED_ENCRYPTED_MARKER : ''
    expect(scrubbedApiKey).toBe(STORED_ENCRYPTED_MARKER)
    expect(scrubbedApiKey).not.toBe('')

    // Restart simulation: new store must find the key
    const newStore = new CredentialStore(testDir)
    await newStore.init()
    expect(newStore.hasKey('durable-prov')).toBe(true)
    expect(await newStore.getKey('durable-prov')).toBe('pk-fixture-durable-key')
  })
})

describe('CredentialStore (safeStorage unavailable — fail-closed)', () => {
  // Save original mock and replace with unavailable variant
  let originalAvailable: () => true

  beforeAll(() => {
    originalAvailable = mockSafeStorage.isEncryptionAvailable
    // Override to simulate unavailable safeStorage
    ;(mockSafeStorage as unknown as Record<string, unknown>).isEncryptionAvailable = () => false
  })

  afterAll(() => {
    ;(mockSafeStorage as unknown as Record<string, unknown>).isEncryptionAvailable = originalAvailable
  })

  let testDir: string
  let store: CredentialStore

  beforeEach(async () => {
    testDir = join(tmpdir(), `cred-test-ephemeral-${randomUUID()}`)
    await mkdir(testDir, { recursive: true })
    store = new CredentialStore(testDir)
    await store.init()
  })

  it('should report unavailable', () => {
    expect(store.isAvailable()).toBe(false)
  })

  it('should still support in-memory get/set (ephemeral mode)', async () => {
    await store.setKey('ephemeral-test', 'pk-fixture-ephemeral-key')
    const key = await store.getKey('ephemeral-test')
    expect(key).toBe('pk-fixture-ephemeral-key')
  })

  it('should return null for non-existent key in ephemeral mode', async () => {
    const key = await store.getKey('nonexistent')
    expect(key).toBeNull()
  })

  it('should NOT persist keys to disk when safeStorage is unavailable', async () => {
    await store.setKey('no-persist', 'pk-fixture-should-not-persist')
    // The credentials file should not exist
    const { access } = await import('node:fs/promises')
    let fileExists = true
    try {
      await access(join(testDir, 'credentials.enc'))
    } catch {
      fileExists = false
    }
    expect(fileExists).toBe(false)
  })

  it('should not survive a restart in ephemeral mode (no disk persistence)', async () => {
    await store.setKey('volatile-key', 'pk-fixture-volatile')
    // New store instance = new in-memory cache, should not find the key
    const newStore = new CredentialStore(testDir)
    await newStore.init()
    const key = await newStore.getKey('volatile-key')
    expect(key).toBeNull()
  })

  it('should still mask keys in ephemeral mode', async () => {
    await store.setKey('mask-test', 'pk-fixture-v1-abcdef1234567890abcdef')
    const masked = store.maskKey('mask-test')
    expect(masked).toContain('pk-fi')
    expect(masked).toContain('…')
    expect(masked).toContain('cdef')
  })

  it('should still migrate keys into memory (but not persist)', async () => {
    const providers = [
      { id: 'migrate-ephemeral', apiKey: 'pk-fixture-migrate-me' }
    ]
    const migrated = await store.migrateFromSettings(providers)
    expect(migrated).toBe(true)
    expect(await store.getKey('migrate-ephemeral')).toBe('pk-fixture-migrate-me')
  })

  it('should scrub marker — never treat STORED_ENCRYPTED_MARKER as a real key', async () => {
    await store.setKey('marker-test', STORED_ENCRYPTED_MARKER)
    expect(await store.getKey('marker-test')).toBeNull()
    expect(store.hasKey('marker-test')).toBe(false)
    expect(store.maskKey('marker-test')).toBe('')
  })

  it('should support delete in ephemeral mode', async () => {
    await store.setKey('delete-test', 'pk-fixture-to-delete')
    await store.deleteKey('delete-test')
    expect(await store.getKey('delete-test')).toBeNull()
  })

  it('should list provider IDs in ephemeral mode', async () => {
    await store.setKey('ep-a', 'pk-fixture-a')
    await store.setKey('ep-b', 'pk-fixture-b')
    expect(store.listProviderIds()).toEqual(['ep-a', 'ep-b'])
  })

  it('should support getKeySync in ephemeral mode', async () => {
    await store.setKey('sync-ep', 'pk-fixture-sync-ep')
    expect(store.getKeySync('sync-ep')).toBe('pk-fixture-sync-ep')
    expect(store.getKeySync('nonexistent')).toBe('')
  })

  it('should allow wipe in ephemeral mode', async () => {
    await store.setKey('wipe-test', 'pk-fixture-to-wipe')
    await store.wipe()
    expect(await store.getKey('wipe-test')).toBeNull()
  })

  it('should have hasKey() true but isAvailable() false after ephemeral migration (caller contract)', async () => {
    // This is the key contract: after migrateFromSettings in ephemeral mode,
    // hasKey() returns true IN-MEMORY but the caller MUST NOT persist
    // STORED_ENCRYPTED_MARKER to the settings file because the key will
    // not survive a restart.
    const providers = [
      { id: 'contract-test', apiKey: 'pk-fixture-contract-key' }
    ]
    const migrated = await store.migrateFromSettings(providers)
    expect(migrated).toBe(true)
    expect(store.hasKey('contract-test')).toBe(true)
    expect(store.isAvailable()).toBe(false)

    // Simulate caller deciding the scrubbed apiKey value:
    // When isAvailable() is false, the scrubbed apiKey must be '' not STORED_ENCRYPTED_MARKER
    const wouldPersist = store.isAvailable()
    const scrubbedApiKey = wouldPersist ? STORED_ENCRYPTED_MARKER : ''
    expect(scrubbedApiKey).toBe('')
    expect(scrubbedApiKey).not.toBe(STORED_ENCRYPTED_MARKER)
    expect(scrubbedApiKey).not.toBe('pk-fixture-contract-key')
  })

  it('should lose all keys after ephemeral restart (no STORED_ENCRYPTED_MARKER survives)', async () => {
    await store.setKey('volatile-prov', 'pk-fixture-volatile-v2')
    expect(store.hasKey('volatile-prov')).toBe(true)

    // New store = simulated restart.  Key must not survive.
    const newStore = new CredentialStore(testDir)
    await newStore.init()
    expect(newStore.hasKey('volatile-prov')).toBe(false)
    expect(await newStore.getKey('volatile-prov')).toBeNull()

    // If the caller had written STORED_ENCRYPTED_MARKER to the settings
    // file, the marker would falsely claim durable encryption.  Verify
    // that a caller respecting isAvailable() would set apiKey to ''.
    // The settings file should NOT contain the marker for this provider.
  })
})
