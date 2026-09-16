import { randomUUID } from "node:crypto"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

export interface LockHandle {
  release(): Promise<void>
}

export class FileLockError extends Error {
  constructor(
    readonly code: "write" | "lock-timeout",
    readonly file: string,
    options?: ErrorOptions,
  ) {
    super(
      code === "write"
        ? `Storage lock could not be created: ${file}.lock`
        : `Storage is busy; retry after the writer finishes. Remove an abandoned lock only after confirming no writer is active: ${file}.lock`,
      options,
    )
  }
}

export async function acquireFileLock(
  file: string,
  timing: {
    lockTimeoutMs: number
    minBackoffMs: number
    maxBackoffMs: number
  },
): Promise<LockHandle> {
  const lockDir = `${file}.lock`
  const ownerFile = join(lockDir, "owner")
  const owner = `${process.pid}:${randomUUID()}`
  const started = Date.now()
  await mkdir(dirname(file), { recursive: true })

  while (true) {
    try {
      await mkdir(lockDir)
      try {
        await writeFile(ownerFile, owner, { encoding: "utf8", mode: 0o600 })
      } catch (error) {
        await rm(lockDir, { recursive: true, force: true }).catch(() => {})
        throw error
      }
      return {
        async release() {
          try {
            if ((await readFile(ownerFile, "utf8")) !== owner) return
            await rm(lockDir, { recursive: true, force: true })
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
          }
        },
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST")
        throw new FileLockError("write", file, { cause: error })
    }

    if (Date.now() - started >= timing.lockTimeoutMs)
      throw new FileLockError("lock-timeout", file)
    // Age cannot establish abandonment; recovery requires confirming no writer is active.
    const spread = timing.maxBackoffMs - timing.minBackoffMs
    const delay = timing.minBackoffMs + Math.floor(Math.random() * (spread + 1))
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
}
