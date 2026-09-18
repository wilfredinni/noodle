import { lstat, mkdir, open, stat, unlink } from "node:fs/promises"
import { dirname, join, parse, resolve } from "node:path"
import { expandUserPath } from "./userPath"

export async function validateResponseOutput(
  value: string,
  { unique = false }: { unique?: boolean } = {},
): Promise<string> {
  if (!value.trim() || value.includes("\0") || /[\\/]$/.test(value))
    throw new Error("Output must be a file path")
  let path = resolve(expandUserPath(value))
  const { dir, name, ext } = parse(path)
  const numbered = name.match(/^(.*)\(([1-9]\d*)\)$/)
  const stem = numbered?.[1] ?? name
  let number = BigInt(numbered?.[2] ?? 0)
  while (true) {
    try {
      await lstat(path)
      if (!unique) throw new Error(`Output already exists: ${path}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      break
    }
    path = join(dir, `${stem}(${++number})${ext}`)
  }
  let parent = dirname(path)
  while (true) {
    try {
      const info = await stat(parent)
      if (!info.isDirectory())
        throw new Error(`Output parent is not a directory: ${parent}`)
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      const next = dirname(parent)
      if (next === parent) throw error
      parent = next
    }
  }
  return path
}

export async function saveResponseFile(
  path: string,
  bytes: Uint8Array,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const file = await open(path, "wx", 0o600)
  let identity: Awaited<ReturnType<typeof file.stat>> | undefined
  try {
    identity = await file.stat()
    await file.writeFile(bytes)
    await file.close()
  } catch (error) {
    await file.close().catch(() => {})
    const current = await lstat(path).catch(() => null)
    if (
      identity &&
      current?.dev === identity.dev &&
      current.ino === identity.ino
    )
      await unlink(path).catch(() => {})
    throw new Error(`Unable to save response: ${path}`, { cause: error })
  }
}

export async function openResponseFile(
  path: string,
  spawn: typeof Bun.spawn = Bun.spawn,
): Promise<void> {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "explorer.exe"
        : "xdg-open"
  try {
    const child = spawn([command, resolve(path)], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    })
    if ((await child.exited) !== 0) throw new Error("System opener failed")
  } catch (error) {
    throw new Error(`Unable to open saved response: ${path}`, { cause: error })
  }
}
