import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CloudWorkspaceClient } from '../../src/main/services/cloud-workspace-client'
import { WorkspaceError, WorkspaceErrorCode } from '../../src/main/services/types/workspace.types'
import type { CreateWorkspaceOptions } from '../../src/shared/types'

const baseOptions: CreateWorkspaceOptions = {
  name: 'Test Cloud WS',
  description: 'desc',
  icon: '🧠',
  path: '/tmp/ws',
  owner: { name: 'User', email: 'user@example.com' },
  enableCloudSync: true,
}

describe('CloudWorkspaceClient', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('creates workspace via POST /api/v1/workspaces', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: 'cloud-uuid-1',
        name: 'Test Cloud WS',
        gitProvider: 'sibylla',
        gitRemoteUrl: 'https://git.example/ws.git',
        syncInterval: 30,
      }),
    })

    const client = new CloudWorkspaceClient('http://localhost:3000')
    const result = await client.createWorkspace('token-abc', baseOptions)

    expect(result.id).toBe('cloud-uuid-1')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/workspaces',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-abc',
        }),
      }),
    )
  })

  it('throws CLOUD_AUTH_REQUIRED on 401', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Unauthorized' } }),
    })

    const client = new CloudWorkspaceClient('http://localhost:3000')
    await expect(client.createWorkspace('bad', baseOptions)).rejects.toMatchObject({
      code: WorkspaceErrorCode.CLOUD_AUTH_REQUIRED,
    })
  })

  it('throws CLOUD_CREATE_FAILED on server error', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'Internal error' } }),
    })

    const client = new CloudWorkspaceClient('http://localhost:3000')
    await expect(client.createWorkspace('token', baseOptions)).rejects.toBeInstanceOf(WorkspaceError)
  })
})
