import { randomUUID } from "node:crypto"
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises"
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
    recoverDeadOwner?: boolean
  },
): Promise<LockHandle> {
  const lockDir = `${file}.lock`
  const ownerFile = join(lockDir, "owner")
  const owner = `${process.pid}:${randomUUID()}`
  const started = Date.now()
  let recovered = false
  await mkdir(dirname(file), { recursive: true })

  while (true) {
    let creationError: unknown
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
      const fsError = error as NodeJS.ErrnoException
      // Windows can reject mkdir while a released lock directory is pending deletion.
      if (
        fsError.code !== "EEXIST" &&
        !(
          process.platform === "win32" &&
          fsError.code === "EPERM" &&
          fsError.syscall === "mkdir"
        )
      )
        throw new FileLockError("write", file, { cause: error })
      if (fsError.code !== "EEXIST") creationError = error
    }

    if (creationError) {
      if (Date.now() - started >= timing.lockTimeoutMs)
        throw new FileLockError("write", file, { cause: creationError })
    } else {
      if (recovered && Date.now() - started >= timing.lockTimeoutMs)
        throw new FileLockError("lock-timeout", file)
      if (timing.recoverDeadOwner && (await recoverDeadOwner(lockDir))) {
        recovered = true
        continue
      }
      if (Date.now() - started >= timing.lockTimeoutMs)
        throw new FileLockError("lock-timeout", file)
    }
    const spread = timing.maxBackoffMs - timing.minBackoffMs
    const delay = timing.minBackoffMs + Math.floor(Math.random() * (spread + 1))
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
}

async function recoverDeadOwner(lockDir: string): Promise<boolean> {
  try {
    const directory = await lstat(lockDir)
    if (!directory.isDirectory()) return false
    const entries = await readdir(lockDir, { withFileTypes: true })
    if (
      entries.length !== 1 ||
      entries[0]?.name !== "owner" ||
      !entries[0].isFile()
    )
      return false
    const ownerFile = join(lockDir, "owner")
    const owner = await readFile(ownerFile, "utf8")
    const match =
      /^([1-9]\d*):([\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12})$/i.exec(owner)
    if (!match || match[0] !== owner) return false
    const pid = Number(match[1])
    if (!Number.isSafeInteger(pid) || pid > 0x7fffffff) return false
    try {
      process.kill(pid, 0)
      return false
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") return false
    }
    const current = await lstat(lockDir)
    if (
      current.dev !== directory.dev ||
      current.ino !== directory.ino ||
      (await readFile(ownerFile, "utf8")) !== owner
    )
      return false
    // Keep this nonempty, deterministic backup so a competing recovery cannot move a replacement lock.
    await rename(lockDir, `${lockDir}.abandoned-${owner.replace(":", "-")}`)
    return true
  } catch {
    // Uncertain ownership or inaccessible metadata must leave storage locked.
    return false
  }
}
