import fs from 'fs'
import path from 'path'

let localEnvLoaded = false

function loadLocalEnvFile(): void {
  if (localEnvLoaded) return
  localEnvLoaded = true

  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), 'sibylla-desktop', '.env'),
  ]

  for (const envPath of candidates) {
    try {
      const content = fs.readFileSync(envPath, 'utf-8')
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eq = trimmed.indexOf('=')
        if (eq <= 0) continue
        const key = trimmed.slice(0, eq).trim()
        const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
        if (!(key in process.env)) {
          process.env[key] = value
        }
      }
      break
    } catch {
      // try next candidate
    }
  }
}

/**
 * Resolve Sibylla Cloud API base URL for desktop main process.
 * Set CLOUD_API_URL=http://localhost:3000 in .env for local development.
 */
export function getCloudApiBaseUrl(): string {
  loadLocalEnvFile()

  const fromEnv = process.env.CLOUD_API_URL?.trim()
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, '')
  }
  return process.env.NODE_ENV === 'production'
    ? 'https://api.sibylla.io'
    : 'http://localhost:3000'
}
