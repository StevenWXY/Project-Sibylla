import { promises as fs, FileHandle } from 'fs'
import * as path from 'path'

export interface LockHandle {
  targetPath: string
  lockPath: string
  fileHandle: FileHandle
  acquiredAt: number
}

const DEFAULT_RETRY_INTERVAL_MS = 80
const DEFAULT_STALE_LOCK_MS = 60_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export class FileLock {
  async acquireExclusive(
    targetPath: string,
    timeoutMs: number = 5000,
    staleLockMs: number = DEFAULT_STALE_LOCK_MS
  ): Promise<LockHandle> {
    const lockPath = `${targetPath}.lock`
    const startAt = Date.now()
    await fs.mkdir(path.dirname(lockPath), { recursive: true })

    while (Date.now() - startAt < timeoutMs) {
      try {
        const fileHandle = await fs.open(lockPath, 'wx')
        await fileHandle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`, 'utf-8')

        return {
          targetPath,
          lockPath,
          fileHandle,
          acquiredAt: Date.now(),
        }
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException
        if (nodeError.code !== 'EEXIST') {
          throw error
        }

        const isStale = await this.isStaleLock(lockPath, staleLockMs)
        if (isStale) {
          await fs.unlink(lockPath).catch(() => undefined)
          continue
        }

        await sleep(DEFAULT_RETRY_INTERVAL_MS)
      }
    }

    throw new Error(`Failed to acquire lock for ${targetPath}: timeout`)
  }

  async release(handle: LockHandle): Promise<void> {
    await handle.fileHandle.close().catch(() => undefined)
    await fs.unlink(handle.lockPath).catch(() => undefined)
  }

  private async isStaleLock(lockPath: string, staleMs: number): Promise<boolean> {
    try {
      const stat = await fs.stat(lockPath)
      const ageMs = Date.now() - stat.mtimeMs
      return ageMs > staleMs
    } catch {
      return false
    }
  }
}
