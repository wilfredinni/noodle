// Publish staged import files into an existing collection, keeping originals until settings save.
import {
  chmod,
  link,
  lstat,
  mkdir,
  rename,
  rmdir,
  unlink,
  rm,
} from "node:fs/promises"
import { dirname, join } from "node:path"

export async function publishImportFiles(
  stage: string,
  root: string,
  paths: string[],
  overwrite: boolean,
  finish: () => Promise<void>,
): Promise<void> {
  const changes: {
    target: string
    staged: string
    backup?: string
    installed?: boolean
  }[] = []
  const directories = new Set<string>()
  const ensureParent = async (dir: string): Promise<void> => {
    if (dir === root || directories.has(dir)) return
    await ensureParent(dirname(dir))
    try {
      await mkdir(dir)
      directories.add(dir)
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== "EEXIST" ||
        !(await lstat(dir)).isDirectory()
      )
        throw error
    }
  }
  try {
    for (const path of paths) {
      const target = join(root, path)
      await ensureParent(dirname(target))
      const change: (typeof changes)[number] = {
        target,
        staged: join(stage, path),
      }
      changes.push(change)
      if (overwrite) {
        const stat = await lstat(target).catch(
          (error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error
          },
        )
        if (stat) {
          if (!stat.isFile())
            throw new Error(`Import target is not a regular file: ${path}`)
          const backup = join(stage, `.original-${changes.length}`)
          await chmod(change.staged, stat.mode & 0o777)
          await rename(target, backup)
          change.backup = backup
        }
      }
      await link(change.staged, target)
      change.installed = true
    }
    await finish()
  } catch (error) {
    for (const { target, staged, backup, installed } of changes.reverse()) {
      if (installed) {
        const [current, ours] = await Promise.all([
          lstat(target),
          lstat(staged),
        ])
        if (current.dev !== ours.dev || current.ino !== ours.ino)
          throw new Error(
            `Import target changed during rollback: ${target}. Backups retained in ${stage}`,
            { cause: error },
          )
        await unlink(target)
      }
      if (backup) await link(backup, target)
    }
    for (const dir of [...directories].reverse())
      await rmdir(dir).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== "ENOTEMPTY" && err.code !== "EEXIST") throw err
      })
    await rm(stage, { recursive: true, force: true })
    throw error
  }
  await rm(stage, { recursive: true, force: true })
}
