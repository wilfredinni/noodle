import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import { readFile } from "node:fs/promises"

export async function listEnvironments(dir: string): Promise<string[]> {
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return []
    throw new Error(`env.list: ${e instanceof Error ? e.message : String(e)}`, {
      cause: e,
    })
  }
  const names: string[] = []
  for (const entry of entries) {
    if (!entry.endsWith(".env")) continue
    let isFile = false
    try {
      const s = await stat(join(dir, entry))
      isFile = s.isFile()
    } catch {
      // isFile stays false
    }
    if (isFile) names.push(entry.slice(0, -".env".length))
  }
  return names
}

export async function listEnvironmentsWithColors(
  dir: string,
): Promise<{ name: string; color?: string }[]> {
  const names = await listEnvironments(dir)
  const result: { name: string; color?: string }[] = []
  for (const name of names) {
    let color: string | undefined
    try {
      const content = await readFile(join(dir, `${name}.env`), "utf-8")
      const firstLine = content.split("\n")[0] ?? ""
      if (firstLine.startsWith("_color=")) {
        const value = firstLine.slice("_color=".length).trim()
        if (value) color = value
      }
    } catch {
      // ignore read errors
    }
    result.push({ name, color })
  }
  return result
}
