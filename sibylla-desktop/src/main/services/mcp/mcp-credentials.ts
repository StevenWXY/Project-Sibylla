import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { logger } from '../../utils/logger'

interface KeytarModule {
  setPassword(service: string, account: string, password: string): Promise<void>
  getPassword(service: string, account: string): Promise<string | null>
  deletePassword(service: string, account: string): Promise<boolean>
  findCredentials(service: string): Promise<Array<{ account: string; password: string }>>
}

let keytar: KeytarModule | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  keytar = require('keytar') as KeytarModule
} catch {
  logger.info('[MCPCredentials] keytar not available, using safeStorage fallback')
}

export class MCPCredentials {
  private static readonly SERVICE_NAME = 'sibylla-mcp'
  private encryptedStore: Map<string, string> = new Map()
  private encFilePath: string | null = null
  private useKeytar: boolean
  private salt: Buffer

  constructor(
    private readonly workspaceRoot: string,
    private readonly encryptionKey: string,
  ) {
    this.useKeytar = keytar !== null
    if (!this.useKeytar) {
      this.encFilePath = path.join(this.workspaceRoot, '.sibylla', 'mcp', 'credentials.enc')
    }
    this.salt = crypto.createHash('sha256').update(`${workspaceRoot}:${encryptionKey}`).digest()
  }

  async saveCredential(serverName: string, key: string, value: string): Promise<void> {
    const accountKey = `${serverName}:${key}`
    if (this.useKeytar && keytar) {
      await keytar.setPassword(MCPCredentials.SERVICE_NAME, accountKey, value)
      logger.debug(`[MCPCredentials] Saved via keytar`, { serverName, key })
    } else {
      this.encryptedStore.set(accountKey, this.encrypt(value))
      await this.persistEncryptedStore()
      logger.debug(`[MCPCredentials] Saved via safeStorage`, { serverName, key })
    }
  }

  async getCredential(serverName: string, key: string): Promise<string | null> {
    const accountKey = `${serverName}:${key}`
    if (this.useKeytar && keytar) {
      return keytar.getPassword(MCPCredentials.SERVICE_NAME, accountKey)
    }
    const encrypted = this.encryptedStore.get(accountKey)
    if (!encrypted) return null
    return this.decrypt(encrypted)
  }

  async deleteCredential(serverName: string, key: string): Promise<void> {
    const accountKey = `${serverName}:${key}`
    if (this.useKeytar && keytar) {
      await keytar.deletePassword(MCPCredentials.SERVICE_NAME, accountKey)
    } else {
      this.encryptedStore.delete(accountKey)
      await this.persistEncryptedStore()
    }
  }

  async deleteAllCredentials(serverName: string): Promise<void> {
    if (this.useKeytar && keytar) {
      const credentials = await keytar.findCredentials(MCPCredentials.SERVICE_NAME)
      for (const cred of credentials) {
        if (cred.account.startsWith(`${serverName}:`)) {
          await keytar.deletePassword(MCPCredentials.SERVICE_NAME, cred.account)
        }
      }
    } else {
      for (const key of this.encryptedStore.keys()) {
        if (key.startsWith(`${serverName}:`)) {
          this.encryptedStore.delete(key)
        }
      }
      await this.persistEncryptedStore()
    }
  }

  async replacePlaceholders(
    configEnv: Record<string, string>,
    serverName: string,
  ): Promise<Record<string, string>> {
    const result: Record<string, string> = {}
    for (const [key, value] of Object.entries(configEnv)) {
      const placeholderMatch = value.match(/^\{\{(\w+)\}\}$/)
      if (placeholderMatch) {
        const credentialKey = placeholderMatch[1] ?? ''
        const credential = await this.getCredential(serverName, credentialKey)
        if (credential) {
          result[key] = credential
        } else {
          logger.warn(`[MCPCredentials] Missing credential`, { serverName, key: credentialKey })
          result[key] = value
        }
      } else {
        result[key] = value
      }
    }
    return result
  }

  async initialize(): Promise<void> {
    if (!this.useKeytar && this.encFilePath) {
      await this.loadEncryptedStore()
    }
  }

  private encrypt(plaintext: string): string {
    const key = this.deriveKey()
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    return iv.toString('hex') + ':' + encrypted.toString('hex')
  }

  private decrypt(ciphertext: string): string {
    const key = this.deriveKey()
    const parts = ciphertext.split(':')
    if (parts.length < 2) {
      throw new Error('Invalid ciphertext format')
    }
    const iv = Buffer.from(parts[0]!, 'hex')
    const encrypted = Buffer.from(parts[1]!, 'hex')
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
    return decipher.update(encrypted).toString('utf8') + decipher.final('utf8')
  }

  private deriveKey(): Buffer {
    return crypto.scryptSync(this.encryptionKey, this.salt, 32)
  }

  private async loadEncryptedStore(): Promise<void> {
    if (!this.encFilePath) return
    try {
      if (fs.existsSync(this.encFilePath)) {
        const data = await fs.promises.readFile(this.encFilePath, 'utf-8')
        const parsed = JSON.parse(data) as Record<string, string>
        this.encryptedStore = new Map(Object.entries(parsed))
      }
    } catch (err) {
      logger.warn('[MCPCredentials] Failed to load encrypted store', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  private async persistEncryptedStore(): Promise<void> {
    if (!this.encFilePath) return
    try {
      const dir = path.dirname(this.encFilePath)
      await fs.promises.mkdir(dir, { recursive: true })
      const data = JSON.stringify(Object.fromEntries(this.encryptedStore))
      await fs.promises.writeFile(this.encFilePath, data, 'utf-8')
    } catch (err) {
      logger.error('[MCPCredentials] Failed to persist encrypted store', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}
