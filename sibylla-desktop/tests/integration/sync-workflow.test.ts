/**
 * Sync Workflow Integration Tests
 *
 * End-to-end tests validating the complete data-sync pipeline:
 *
 *  Client 1: init → write file → stage → commit → push
 *  Client 2: init → setRemote → pull → verify file consistency
 *  Client 2: modify → stage → commit → push
 *  Client 1: pull → verify updated content
 *
 * These tests require a running Gitea instance
 * (docker compose -f docker-compose.test.yml up -d  from sibylla-cloud/).
 *
 * Because GitAbstraction has no Electron dependencies, we instantiate it
 * directly in Vitest without any mocking.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { GitAbstraction } from '../../src/main/services/git-abstraction'

// ─── Test Environment Constants ───────────────────────────────────────

const GITEA_PORT = 30011
const GITEA_BASE_URL = `http://127.0.0.1:${GITEA_PORT}`
const GITEA_ADMIN_USER = 'sibylla-test-admin'
const GITEA_ADMIN_PASSWORD = 'test-admin-password-123'

// ─── Helper Types (strict, no `any`) ──────────────────────────────────

interface GiteaUser {
  id: number
  login: string
}

interface GiteaToken {
  id: number
  name: string
  sha1: string
}

interface GiteaRepo {
  id: number
  full_name: string
  clone_url: string
}

// ─── Gitea Admin Helper Functions ─────────────────────────────────────

function adminBasicAuth(): string {
  return Buffer.from(`${GITEA_ADMIN_USER}:${GITEA_ADMIN_PASSWORD}`).toString('base64')
}

async function giteaAdminFetch(
  urlPath: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`${GITEA_BASE_URL}/api/v1${urlPath}`, {
    ...init,
    headers: {
      Authorization: `Basic ${adminBasicAuth()}`,
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  })
}

/**
 * Create a Gitea user via admin API.
 * Returns the created user.
 */
async function createGiteaUser(
  username: string,
  password: string,
  email: string
): Promise<GiteaUser> {
  const res = await giteaAdminFetch('/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      username,
      password,
      email,
      must_change_password: false,
      visibility: 'private',
    }),
  })

  if (res.status === 422) {
    // User may already exist — fetch it
    const getRes = await giteaAdminFetch(`/users/${username}`)
    if (getRes.ok) {
      return (await getRes.json()) as GiteaUser
    }
  }

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Failed to create Gitea user ${username}: ${res.status} ${body}`)
  }
  return (await res.json()) as GiteaUser
}

/**
 * Create an API token for a Gitea user (using basic auth with user credentials).
 */
async function createGiteaToken(
  username: string,
  password: string
): Promise<string> {
  const basicAuth = Buffer.from(`${username}:${password}`).toString('base64')

  // Clean up old tokens with the same name
  const listRes = await fetch(
    `${GITEA_BASE_URL}/api/v1/users/${username}/tokens`,
    {
      headers: { Authorization: `Basic ${basicAuth}` },
    }
  )
  if (listRes.ok) {
    const tokens = (await listRes.json()) as GiteaToken[]
    for (const t of tokens) {
      if (t.name === 'sync-test') {
        await fetch(
          `${GITEA_BASE_URL}/api/v1/users/${username}/tokens/${t.id}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Basic ${basicAuth}` },
          }
        )
      }
    }
  }

  const res = await fetch(
    `${GITEA_BASE_URL}/api/v1/users/${username}/tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'sync-test', scopes: ['all'] }),
    }
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Failed to create Gitea token for ${username}: ${res.status} ${body}`)
  }

  const data = (await res.json()) as GiteaToken
  return data.sha1
}

/**
 * Create an empty repo owned by a user via admin API.
 */
async function createGiteaRepo(
  ownerUsername: string,
  repoName: string
): Promise<GiteaRepo> {
  const res = await giteaAdminFetch(`/admin/users/${ownerUsername}/repos`, {
    method: 'POST',
    body: JSON.stringify({
      name: repoName,
      private: true,
      auto_init: false,
      default_branch: 'main',
    }),
  })

  if (res.status === 409) {
    // Repo already exists — fetch it
    const getRes = await giteaAdminFetch(`/repos/${ownerUsername}/${repoName}`)
    if (getRes.ok) {
      return (await getRes.json()) as GiteaRepo
    }
  }

  if (!res.ok) {
    const body = await res.text()
    throw new Error(
      `Failed to create Gitea repo ${ownerUsername}/${repoName}: ${res.status} ${body}`
    )
  }
  return (await res.json()) as GiteaRepo
}

/**
 * Delete a Gitea repo (cleanup).
 */
async function deleteGiteaRepo(
  ownerUsername: string,
  repoName: string
): Promise<void> {
  await giteaAdminFetch(`/repos/${ownerUsername}/${repoName}`, {
    method: 'DELETE',
  })
}

// ─── Test Suite ───────────────────────────────────────────────────────

describe('Sync Workflow Integration', () => {
  // Shared state across the ordered test sequence
  let tmpBase: string
  let client1Dir: string
  let client2Dir: string

  // Gitea setup
  const testUsername = `syncuser-${Date.now()}`
  const testPassword = 'SyncTestPass123!'
  const testEmail = `${testUsername}@sibylla-test.local`
  const testRepoName = `sync-test-${Date.now()}`
  let userToken: string
  let repoCloneUrl: string

  // ─── Lifecycle ────────────────────────────────────────────────────

  beforeAll(async () => {
    // Verify Gitea is reachable
    const versionRes = await fetch(
      `${GITEA_BASE_URL}/api/v1/version`,
      { signal: AbortSignal.timeout(5000) }
    ).catch(() => null)

    if (!versionRes?.ok) {
      throw new Error(
        `Gitea not reachable at ${GITEA_BASE_URL}. ` +
          'Run: cd sibylla-cloud && docker compose -f docker-compose.test.yml up -d'
      )
    }

    // Create Gitea user, token, and empty repo
    await createGiteaUser(testUsername, testPassword, testEmail)
    userToken = await createGiteaToken(testUsername, testPassword)
    const repo = await createGiteaRepo(testUsername, testRepoName)

    // Build clone URL using the host-side port (not Docker-internal)
    repoCloneUrl = `http://127.0.0.1:${GITEA_PORT}/${testUsername}/${testRepoName}.git`

    // Create temp directories for two simulated clients
    tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'sibylla-sync-'))
    client1Dir = path.join(tmpBase, 'client1')
    client2Dir = path.join(tmpBase, 'client2')
    await fs.mkdir(client1Dir, { recursive: true })
    await fs.mkdir(client2Dir, { recursive: true })
  }, 60_000) // generous timeout for first-time Gitea init

  afterAll(async () => {
    // Cleanup temp directories
    if (tmpBase) {
      await fs.rm(tmpBase, { recursive: true, force: true })
    }

    // Cleanup Gitea repo
    try {
      await deleteGiteaRepo(testUsername, testRepoName)
    } catch {
      // Best-effort cleanup
    }
  })

  // ─── Step 3: Single-sided push ────────────────────────────────────

  describe('Single-sided Push (Client 1)', () => {
    let git1: GitAbstraction

    it('should initialize a local workspace', async () => {
      // Arrange
      git1 = new GitAbstraction({
        workspaceDir: client1Dir,
        authorName: 'Client 1',
        authorEmail: 'client1@sibylla-test.local',
      })

      // Act
      await git1.init()

      // Assert
      const initialized = await git1.isInitialized()
      expect(initialized).toBe(true)
    })

    it('should configure remote repository', async () => {
      // Act
      await git1.setRemote(repoCloneUrl, userToken)

      // Assert — no throw means success
      expect(true).toBe(true)
    })

    it('should write, stage, and commit a test file', async () => {
      // Arrange — write a file directly to the workspace
      const testContent = '# Sync Test\n\nThis file was created by Client 1.\n'
      await fs.writeFile(path.join(client1Dir, 'README.md'), testContent, 'utf-8')

      // Act
      await git1.stageFile('README.md')
      const commitHash = await git1.commit('Add README for sync test')

      // Assert
      expect(commitHash).toBeDefined()
      expect(commitHash.length).toBeGreaterThan(0)
    })

    it('should push to Gitea successfully', async () => {
      // Act
      const pushResult = await git1.push()

      // Assert
      expect(pushResult.success).toBe(true)
      expect(pushResult.error).toBeUndefined()
    })

    it('should verify commit exists on Gitea via API', async () => {
      // Act — query the Gitea git refs API to verify the push was received.
      // Note: Gitea does not update its internal "is_empty" flag when pushing
      // to a repo created with auto_init:false, so the /repos/.../commits
      // endpoint may return 409. Use git/refs + git/commits instead.
      const refsRes = await fetch(
        `${GITEA_BASE_URL}/api/v1/repos/${testUsername}/${testRepoName}/git/refs`,
        {
          headers: {
            Authorization: `token ${userToken}`,
          },
        }
      )

      // Assert — refs endpoint should return the pushed branch
      expect(refsRes.ok).toBe(true)
      const refs = (await refsRes.json()) as Array<{
        ref: string
        object: { sha: string }
      }>
      expect(refs.length).toBeGreaterThan(0)

      const mainRef = refs.find((r) => r.ref === 'refs/heads/main')
      expect(mainRef).toBeDefined()

      // Verify the commit message via the git/commits endpoint
      const commitRes = await fetch(
        `${GITEA_BASE_URL}/api/v1/repos/${testUsername}/${testRepoName}/git/commits/${mainRef!.object.sha}`,
        {
          headers: {
            Authorization: `token ${userToken}`,
          },
        }
      )

      expect(commitRes.ok).toBe(true)
      const commit = (await commitRes.json()) as {
        commit: { message: string }
      }
      expect(commit.commit.message).toContain('Add README for sync test')
    })
  })

  // ─── Step 4: Dual-sided sync ──────────────────────────────────────

  describe('Dual-sided Sync (Client 2 pulls, modifies, Client 1 pulls back)', () => {
    let git1: GitAbstraction
    let git2: GitAbstraction

    beforeAll(() => {
      // Re-create Client 1 GitAbstraction pointing at the same directory
      // (it was already initialized and has remote configured)
      git1 = new GitAbstraction({
        workspaceDir: client1Dir,
        authorName: 'Client 1',
        authorEmail: 'client1@sibylla-test.local',
      })
    })

    it('should init Client 2 and pull from remote', async () => {
      // Arrange
      git2 = new GitAbstraction({
        workspaceDir: client2Dir,
        authorName: 'Client 2',
        authorEmail: 'client2@sibylla-test.local',
      })

      await git2.init()
      await git2.setRemote(repoCloneUrl, userToken)

      // Act — pull remote content into Client 2
      const pullResult = await git2.pull()

      // Assert
      expect(pullResult.success).toBe(true)
      expect(pullResult.hasConflicts).toBeFalsy()
    })

    it('should have identical README.md on both clients', async () => {
      // Read files from both client directories
      const content1 = await fs.readFile(
        path.join(client1Dir, 'README.md'),
        'utf-8'
      )
      const content2 = await fs.readFile(
        path.join(client2Dir, 'README.md'),
        'utf-8'
      )

      // Assert content matches exactly
      expect(content2).toBe(content1)
    })

    it('should have matching commit history between clients', async () => {
      // Re-attach remote config for git1 (constructor doesn't persist in-memory state)
      await git1.setRemote(repoCloneUrl, userToken)

      const history1 = await git1.getHistory({ depth: 5 })
      const history2 = await git2.getHistory({ depth: 5 })

      // Both should have the same last commit hash
      expect(history1.length).toBeGreaterThan(0)
      expect(history2.length).toBeGreaterThan(0)
      expect(history2[0]?.oid).toBe(history1[0]?.oid)
      expect(history2[0]?.message).toBe(history1[0]?.message)
    })

    it('should allow Client 2 to modify, commit, and push', async () => {
      // Arrange — modify the file on Client 2
      const updatedContent =
        '# Sync Test\n\nThis file was created by Client 1.\n\nUpdated by Client 2.\n'
      await fs.writeFile(
        path.join(client2Dir, 'README.md'),
        updatedContent,
        'utf-8'
      )

      // Act
      await git2.stageFile('README.md')
      const commitHash = await git2.commit('Update README from Client 2')
      const pushResult = await git2.push()

      // Assert
      expect(commitHash).toBeDefined()
      expect(pushResult.success).toBe(true)
    })

    it('should allow Client 1 to sync and receive Client 2 changes', async () => {
      // Act — Client 1 syncs (pull then push)
      const syncResult = await git1.sync()

      // Assert
      expect(syncResult.success).toBe(true)

      // Verify the file content on Client 1 now matches Client 2's update
      const content1 = await fs.readFile(
        path.join(client1Dir, 'README.md'),
        'utf-8'
      )
      expect(content1).toContain('Updated by Client 2.')
    })

    it('should maintain consistent commit history after bidirectional sync', async () => {
      const history1 = await git1.getHistory({ depth: 10 })
      const history2 = await git2.getHistory({ depth: 10 })

      // Most recent commit should match on both sides
      expect(history1[0]?.oid).toBe(history2[0]?.oid)

      // Both should have at least the initial + test + update commits
      // (init creates an initial .gitignore commit, plus our 2 test commits)
      expect(history1.length).toBeGreaterThanOrEqual(3)
      expect(history2.length).toBeGreaterThanOrEqual(3)
    })
  })
})
