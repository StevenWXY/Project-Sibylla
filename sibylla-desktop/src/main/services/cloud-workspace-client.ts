import { getCloudApiBaseUrl } from '../config/cloud-api-url'
import { logger } from '../utils/logger'
import type { CreateWorkspaceOptions } from '../../shared/types'
import { WorkspaceError, WorkspaceErrorCode } from './types/workspace.types'

export interface CloudWorkspaceRecord {
  id: string
  name: string
  description: string | null
  icon: string | null
  gitProvider: 'sibylla' | 'github' | 'gitlab'
  gitRemoteUrl: string | null
  defaultModel: string
  syncInterval: number
}

interface CloudErrorBody {
  error?: {
    code?: string
    message?: string
  }
}

/**
 * HTTP client for Sibylla Cloud workspace APIs (desktop main process).
 */
export class CloudWorkspaceClient {
  constructor(private readonly baseUrl: string = getCloudApiBaseUrl()) {}

  async createWorkspace(
    accessToken: string,
    options: CreateWorkspaceOptions,
  ): Promise<CloudWorkspaceRecord> {
    const payload: Record<string, unknown> = {
      name: options.name,
      description: options.description,
      icon: options.icon,
      gitProvider: options.gitProvider ?? 'sibylla',
      defaultModel: options.defaultModel,
      syncInterval: options.syncInterval,
    }

    if (options.gitRemoteUrl) {
      payload.gitRemoteUrl = options.gitRemoteUrl
    }

    const response = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/api/v1/workspaces`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      let message = `Cloud workspace creation failed: ${response.status}`
      try {
        const body = (await response.json()) as CloudErrorBody
        message = body.error?.message ?? message
      } catch {
        // ignore parse errors
      }

      if (response.status === 401 || response.status === 403) {
        throw new WorkspaceError(WorkspaceErrorCode.CLOUD_AUTH_REQUIRED, message, {
          status: response.status,
        })
      }

      throw new WorkspaceError(WorkspaceErrorCode.CLOUD_CREATE_FAILED, message, {
        status: response.status,
      })
    }

    const workspace = (await response.json()) as CloudWorkspaceRecord
    logger.info('[CloudWorkspaceClient] Workspace created', {
      workspaceId: workspace.id,
      gitProvider: workspace.gitProvider,
      hasGitRemote: Boolean(workspace.gitRemoteUrl),
    })
    return workspace
  }
}
