import { constants, existsSync } from "node:fs"
import { lstat, mkdir, open, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { env } from "../env"
import { acquireFileLock } from "../fileLock"
import { saveSettings } from "./save"

const localDirectories = ["/.timeline/", "/.noodle/"]

export async function ensureCollectionGitignore(dir: string): Promise<void> {
  const path = join(dir, ".gitignore")
  const lock = await acquireFileLock(path, {
    lockTimeoutMs: 5000,
    minBackoffMs: 10,
    maxBackoffMs: 50,
  })
  try {
    try {
      await writeFile(path, localDirectories.join("\n") + "\n", { flag: "wx" })
      return
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    }
    await appendMissingIgnores(path)
  } finally {
    await lock.release()
  }
}

async function appendMissingIgnores(path: string): Promise<void> {
  const existing = await lstat(path)
  if (!existing.isFile() || existing.nlink !== 1)
    throw new Error(
      "Cannot update .gitignore: expected a regular file with a single link",
    )
  const file = await open(
    path,
    constants.O_RDWR |
      constants.O_APPEND |
      (process.platform === "win32"
        ? 0
        : constants.O_NOFOLLOW | constants.O_NONBLOCK),
  )
  try {
    const stat = await file.stat()
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      existing.ino !== stat.ino ||
      existing.dev !== stat.dev
    )
      throw new Error(".gitignore changed during initialization")
    const content = await file.readFile("utf8")
    const lines = content.split(/\r?\n/)
    // A later Git negation can re-include either directory.
    const lastNegation = lines.findLastIndex((line) => line.startsWith("!"))
    const missing = localDirectories.filter(
      (rule) => lines.lastIndexOf(rule) <= lastNegation,
    )
    if (missing.length) {
      const newline = content.includes("\r\n") ? "\r\n" : "\n"
      const separator = content && !content.endsWith("\n") ? newline : ""
      await file.appendFile(separator + missing.join(newline) + newline)
    }
  } finally {
    await file.close()
  }
}

export async function ensureCollectionBootstrapped(dir: string): Promise<void> {
  const envDir = join(dir, ".environments")
  const settingsPath = join(dir, "settings.yml")

  await ensureCollectionGitignore(dir)
  if (!existsSync(settingsPath)) {
    await saveSettings(dir, {
      collectionId: randomUUID(),
      environment: "development",
    })
  }
  if (!existsSync(envDir)) {
    await mkdir(envDir, { recursive: true })
    await env.saveEnvironment(envDir, { name: "development", vars: {} })
  }
}
