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
  const envs: { name: string; created: number }[] = []
  for (const entry of entries) {
    if (!entry.endsWith(".env")) continue
    try {
      const s = await stat(join(dir, entry))
      if (!s.isFile()) continue
      envs.push({
        name: entry.slice(0, -".env".length),
        created: s.birthtimeMs || s.mtimeMs,
      })
    } catch {
      // skip unreadable entries
    }
  }
  envs.sort((a, b) => a.created - b.created)
  return envs.map((e) => e.name)
}
