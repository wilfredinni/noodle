import { lstat, stat } from "node:fs/promises"
import {
  basename,
  dirname,
  join,
  parse,
  relative,
  resolve,
  sep,
} from "node:path"
import { expandUserPath } from "./userPath"
import { responseFileNative } from "./responseFileNative"

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
  const output = await prepareResponseOutput(path)
  try {
    await output.save(bytes)
  } finally {
    await output.close()
  }
}

export interface PreparedResponseOutput {
  readonly path: string
  save(bytes: Uint8Array): Promise<string>
  close(): Promise<void>
}

export async function prepareResponseOutput(
  value: string,
  { unique = false }: { unique?: boolean } = {},
): Promise<PreparedResponseOutput> {
  const path = await validateResponseOutput(value, { unique })
  const native = responseFileNative()
  let parent = dirname(path)
  let anchor: Awaited<ReturnType<typeof native.openAnchor>>
  // Select and pin an existing directory; no directories or files are created yet.
  while (true) {
    try {
      anchor = await native.openAnchor(parent)
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      const next = dirname(parent)
      if (next === parent) throw error
      parent = next
    }
  }
  const components = relative(parent, dirname(path)).split(sep).filter(Boolean)
  const { name, ext } = parse(path)
  const numbered = name.match(/^(.*)\(([1-9]\d*)\)$/)
  const stem = numbered?.[1] ?? name
  let number = BigInt(numbered?.[2] ?? 0)
  let filename = basename(path)
  let closed = false
  let saving = false
  return {
    path,
    async save(bytes) {
      if (closed || saving)
        throw new Error("Response output is closed or in use")
      saving = true
      let directory = anchor
      try {
        if (!(await native.matches(anchor, parent)))
          throw new Error(
            "Output directory changed; choose the destination again",
          )
        for (const component of components) {
          const child = await native.descend(directory, component)
          if (directory !== anchor) native.close(directory)
          directory = child
        }
        let file: Awaited<ReturnType<typeof native.create>>
        while (true) {
          try {
            file = await native.create(directory, filename)
            break
          } catch (error) {
            if (!unique || (error as NodeJS.ErrnoException).code !== "EEXIST")
              throw error
            filename = `${stem}(${++number})${ext}`
          }
        }
        try {
          await native.write(file, bytes)
        } catch (error) {
          await native.cleanup(file).catch(() => {})
          throw error
        } finally {
          native.close(file)
        }
        return join(dirname(path), filename)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") throw error
        throw new Error(`Unable to save response: ${path}`, { cause: error })
      } finally {
        if (directory !== anchor) native.close(directory)
        saving = false
      }
    },
    async close() {
      if (saving) throw new Error("Response output is in use")
      if (!closed) {
        native.close(anchor)
        closed = true
      }
    },
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
