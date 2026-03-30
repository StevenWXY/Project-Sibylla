/**
 * Integration Test Global Setup
 *
 * Configures the test environment for integration tests that require
 * real database and Gitea instances running via docker-compose.test.yml.
 *
 * Responsibilities:
 * - Override process.env to point at isolated test containers
 * - Wait for database readiness
 * - Run migrations
 * - Boot a Fastify app instance for injection-based tests
 * - Clean up on teardown
 *
 * Prerequisites:
 *   docker compose -f docker-compose.test.yml up -d
 */

import type { FastifyInstance } from 'fastify'

// ─── Test Environment Constants ───────────────────────────────────────
const TEST_DB_HOST = '127.0.0.1'
const TEST_DB_PORT = 54321
const TEST_DB_NAME = 'sibylla_test'
const TEST_DB_USER = 'sibylla_test'
const TEST_DB_PASSWORD = 'sibylla_test'
const TEST_GITEA_PORT = 30011
const TEST_GITEA_ADMIN_USER = 'sibylla-test-admin'
const TEST_GITEA_ADMIN_PASSWORD = 'test-admin-password-123'

// ─── Shared State ─────────────────────────────────────────────────────

/** Fastify app instance shared across all integration test files */
let app: FastifyInstance | undefined

/** Gitea admin API token (created once in setup, reused in tests) */
let giteaAdminToken = ''

/**
 * Get the shared Fastify app instance.
 * Throws if called before setup completes.
 */
export function getApp(): FastifyInstance {
  if (!app) {
    throw new Error('Integration test app not initialised — did beforeAll run?')
  }
  return app
}

/**
 * Get the Gitea admin token for creating repos / users during tests.
 */
export function getGiteaAdminToken(): string {
  return giteaAdminToken
}

/**
 * Return test-specific Gitea base URL (host-side port).
 */
export function getGiteaUrl(): string {
  return `http://127.0.0.1:${TEST_GITEA_PORT}`
}

// ─── Setup ────────────────────────────────────────────────────────────

/**
 * Global setup: called once before all integration tests.
 *
 * 1. Inject test env vars (before any module imports config/env.ts)
 * 2. Wait for Postgres readiness
 * 3. Run migrations
 * 4. Build Fastify app
 * 5. Create Gitea admin API token
 */
export async function setup(): Promise<void> {
  // 1. Override environment BEFORE importing app modules
  process.env['NODE_ENV'] = 'test'
  process.env['LOG_LEVEL'] = 'warn'
  process.env['HOST'] = '127.0.0.1'
  process.env['PORT'] = '0' // let OS pick a free port
  process.env['DATABASE_URL'] =
    `postgresql://${TEST_DB_USER}:${TEST_DB_PASSWORD}@${TEST_DB_HOST}:${TEST_DB_PORT}/${TEST_DB_NAME}`
  process.env['DB_HOST'] = TEST_DB_HOST
  process.env['DB_PORT'] = String(TEST_DB_PORT)
  process.env['DB_NAME'] = TEST_DB_NAME
  process.env['DB_USER'] = TEST_DB_USER
  process.env['DB_PASSWORD'] = TEST_DB_PASSWORD
  process.env['JWT_SECRET'] = 'integration-test-secret-key-at-least-32-chars-long'
  process.env['JWT_ACCESS_EXPIRES_IN'] = '15m'
  process.env['JWT_REFRESH_EXPIRES_IN'] = '7d'
  process.env['CORS_ORIGIN'] = '*'
  process.env['GITEA_URL'] = `http://127.0.0.1:${TEST_GITEA_PORT}`
  process.env['GITEA_ADMIN_TOKEN'] = '' // will be set after creation
  process.env['GITEA_ADMIN_USERNAME'] = TEST_GITEA_ADMIN_USER

  // 2. Wait for database to be available (up to 30s)
  const dbReady = await waitForPostgres(30, 1000)
  if (!dbReady) {
    throw new Error(
      `Test database not reachable at ${TEST_DB_HOST}:${TEST_DB_PORT}. ` +
        'Run: docker compose -f docker-compose.test.yml up -d'
    )
  }

  // 3. Run migrations
  await runMigrations()

  // 4. Build app (dynamic import so env overrides take effect)
  const { buildApp } = await import('../../src/app.js')
  app = await buildApp()
  await app.ready()

  // 5. Wait for Gitea and obtain admin token
  const giteaReady = await waitForGitea(60, 2000)
  if (!giteaReady) {
    throw new Error(
      `Test Gitea not reachable at port ${TEST_GITEA_PORT}. ` +
        'Run: docker compose -f docker-compose.test.yml up -d'
    )
  }
  giteaAdminToken = await createGiteaAdminToken()
}

/**
 * Global teardown: called once after all integration tests.
 */
export async function teardown(): Promise<void> {
  if (app) {
    await app.close()
    app = undefined
  }

  // Close the database connection pool
  try {
    const { closeDatabaseConnection } = await import('../../src/db/index.js')
    await closeDatabaseConnection()
  } catch {
    // Pool may already be closed
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Poll Postgres until it responds or we exhaust retries.
 */
async function waitForPostgres(
  maxRetries: number,
  intervalMs: number
): Promise<boolean> {
  const postgres = await import('postgres')
  for (let i = 0; i < maxRetries; i++) {
    try {
      const sql = postgres.default({
        host: TEST_DB_HOST,
        port: TEST_DB_PORT,
        database: TEST_DB_NAME,
        username: TEST_DB_USER,
        password: TEST_DB_PASSWORD,
        connect_timeout: 3,
        max: 1,
      })
      await sql`SELECT 1`
      await sql.end()
      return true
    } catch {
      await delay(intervalMs)
    }
  }
  return false
}

/**
 * Run node-pg-migrate programmatically against the test database.
 */
async function runMigrations(): Promise<void> {
  // Use node-pg-migrate directly instead of via child_process
  const dbUrl = `postgresql://${TEST_DB_USER}:${TEST_DB_PASSWORD}@${TEST_DB_HOST}:${TEST_DB_PORT}/${TEST_DB_NAME}`
  const { runner } = await import('node-pg-migrate')
  await runner({
    databaseUrl: dbUrl,
    dir: new URL('../../migrations', import.meta.url).pathname.replace(/%20/g, ' '),
    direction: 'up',
    migrationsTable: 'pgmigrations',
    createSchema: true,
    createMigrationsSchema: true,
    schema: 'public',
    count: Infinity,
    ignorePattern: '\\..*',
    verbose: true,
    checkOrder: true,
    singleTransaction: true,
    dryRun: false
  })
}

/**
 * Poll Gitea /api/v1/version until it responds.
 */
async function waitForGitea(
  maxRetries: number,
  intervalMs: number
): Promise<boolean> {
  const url = `http://127.0.0.1:${TEST_GITEA_PORT}/api/v1/version`
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) })
      if (res.ok) return true
    } catch {
      // Gitea not ready yet
    }
    await delay(intervalMs)
  }
  return false
}

/**
 * Create (or retrieve) a Gitea API token for the admin user.
 * Uses HTTP Basic auth with the admin credentials to call the token API.
 */
async function createGiteaAdminToken(): Promise<string> {
  const baseUrl = `http://127.0.0.1:${TEST_GITEA_PORT}/api/v1`
  const basicAuth = Buffer.from(
    `${TEST_GITEA_ADMIN_USER}:${TEST_GITEA_ADMIN_PASSWORD}`
  ).toString('base64')
  const headers = {
    Authorization: `Basic ${basicAuth}`,
    'Content-Type': 'application/json',
  }

  // Delete existing tokens with the same name (idempotent)
  try {
    const listRes = await fetch(
      `${baseUrl}/users/${TEST_GITEA_ADMIN_USER}/tokens`,
      { headers }
    )
    if (listRes.ok) {
      const tokens = (await listRes.json()) as Array<{ id: number; name: string }>
      for (const t of tokens) {
        if (t.name === 'integration-test') {
          await fetch(
            `${baseUrl}/users/${TEST_GITEA_ADMIN_USER}/tokens/${t.id}`,
            { method: 'DELETE', headers }
          )
        }
      }
    }
  } catch {
    // Ignore cleanup errors
  }

  // Create a fresh token
  const res = await fetch(
    `${baseUrl}/users/${TEST_GITEA_ADMIN_USER}/tokens`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'integration-test',
        scopes: ['all'],
      }),
    }
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Failed to create Gitea admin token: ${res.status} ${body}`)
  }

  const data = (await res.json()) as { sha1: string }
  return data.sha1
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
