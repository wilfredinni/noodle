import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"

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
  names.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return names
}
