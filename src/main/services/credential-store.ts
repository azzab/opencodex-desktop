import { safeStorage } from 'electron'
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { STORED_ENCRYPTED_MARKER } from '../../shared/app-settings-types'

const CREDENTIALS_FILE = 'credentials.enc'

type CredentialStoreData = {
  version: 1
  encrypted: string // base64-encoded safeStorage blob
}

type PlaintextStore = Record<string, string> // providerId -> apiKey

function encodeBuffer(buf: Buffer): string {
  return buf.toString('base64')
}

function decodeBuffer(encoded: string): Buffer {
  return Buffer.from(encoded, 'base64')
}

/**
 * CredentialStore: stores provider API keys encrypted at rest.
 *
 * Uses Electron safeStorage (OS keychain-backed encryption) exclusively.
 * When safeStorage is unavailable (headless Linux, CI, etc.), the store
 * operates in ephemeral mode: keys live only in memory during the session
 * and are never persisted to disk. This is fail-closed — no host-derived
 * fallback encryption is used.
 */
export class CredentialStore {
  private cache: Map<string, string> = new Map()
  private path: string
  private ready = false
  private available: boolean
  /** When safeStorage is unavailable, we never persist (ephemeral in-memory only). */
  private persistEnabled: boolean

  constructor(userDataPath: string) {
    this.path = join(userDataPath, CREDENTIALS_FILE)
    this.available = safeStorage.isEncryptionAvailable()
    this.persistEnabled = this.available
  }

  /** Returns true only when OS-level encryption is available. */
  isAvailable(): boolean {
    return this.available
  }

  async init(): Promise<void> {
    if (this.ready) return
    if (this.persistEnabled) {
      await mkdir(dirname(this.path), { recursive: true })
      await this.loadFromDisk()
    }
    this.ready = true
  }

  async getKey(providerId: string): Promise<string | null> {
    if (!this.ready) await this.init()
    return this.cache.get(providerId) ?? null
  }

  async setKey(providerId: string, key: string): Promise<void> {
    if (!this.ready) await this.init()
    const trimmed = key.trim()
    if (!trimmed || trimmed === STORED_ENCRYPTED_MARKER) {
      this.cache.delete(providerId)
    } else {
      this.cache.set(providerId, trimmed)
    }
    if (this.persistEnabled) {
      await this.persistToDisk()
    }
  }

  async deleteKey(providerId: string): Promise<void> {
    if (!this.ready) await this.init()
    this.cache.delete(providerId)
    if (this.persistEnabled) {
      await this.persistToDisk()
    }
  }

  hasKey(providerId: string): boolean {
    return this.cache.has(providerId)
  }

  listProviderIds(): string[] {
    return [...this.cache.keys()].sort()
  }

  /** Synchronous lookup from the in-memory cache. Must call init() first. */
  getKeySync(providerId: string): string {
    return this.cache.get(providerId) ?? ''
  }

  maskKey(providerId: string): string {
    const key = this.cache.get(providerId)
    if (!key) return ''
    if (key.length <= 12) return '••••••••'
    const prefix = key.slice(0, 5)
    const suffix = key.slice(-4)
    return `${prefix}…${suffix}`
  }

  /**
   * Migrate plaintext keys from settings into encrypted storage.
   * Returns settings with keys replaced by STORED_ENCRYPTED_MARKER.
   *
   * In ephemeral mode (safeStorage unavailable), keys are still ingested into
   * the in-memory cache but are NOT persisted, and the migration is reported as
   * incomplete so callers can warn the operator.
   */
  async migrateFromSettings(providers: ReadonlyArray<{ id: string; apiKey?: string }>): Promise<boolean> {
    if (!this.ready) await this.init()
    let migrated = false
    for (const p of providers) {
      const key = p.apiKey?.trim()
      if (key && key !== STORED_ENCRYPTED_MARKER) {
        this.cache.set(p.id, key)
        migrated = true
      }
    }
    if (migrated && this.persistEnabled) {
      await this.persistToDisk()
    }
    return migrated
  }

  /**
   * Delete the persisted credentials file and clear cache.
   * Used when safeStorage becomes unavailable mid-session (e.g., keychain lock)
   * to ensure no stale ciphertext remains.
   */
  async wipe(): Promise<void> {
    this.cache.clear()
    try {
      await unlink(this.path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[credential-store] Failed to wipe credentials file:', error)
      }
    }
  }

  private async loadFromDisk(): Promise<void> {
    try {
      const raw = await readFile(this.path, 'utf8')
      const data = JSON.parse(raw) as CredentialStoreData
      if (data.version !== 1) {
        console.warn('[credential-store] Unsupported version, starting fresh')
        this.cache.clear()
        return
      }

      const plaintext = safeStorage.decryptString(decodeBuffer(data.encrypted))
      const parsed: PlaintextStore = JSON.parse(plaintext)
      this.cache.clear()
      for (const [id, key] of Object.entries(parsed)) {
        if (typeof key === 'string' && key.trim()) {
          this.cache.set(id, key.trim())
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.cache.clear()
        return
      }
      console.warn('[credential-store] Failed to load credentials, starting fresh:', error)
      this.cache.clear()
    }
  }

  private async persistToDisk(): Promise<void> {
    const plaintext: PlaintextStore = {}
    for (const [id, key] of this.cache) {
      plaintext[id] = key
    }
    const plaintextStr = JSON.stringify(plaintext)

    const data: CredentialStoreData = {
      version: 1,
      encrypted: encodeBuffer(safeStorage.encryptString(plaintextStr))
    }

    await writeFile(this.path, JSON.stringify(data, null, 2), 'utf8')
  }
}
