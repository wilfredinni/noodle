import { readdir, readFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { lang } from "../lang"
import type { Collection } from "../schema"

export async function loadCollection(dir: string): Promise<Collection> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `filestore.loadCollection: directory not found "${dir}"`,
        { cause: e },
      )
    }
    throw new Error(`filestore.loadCollection: ${msg}`, { cause: e })
  }

  const id = basename(dir)
  const names = entries
    .filter(
      (e) => e.isFile() && !e.name.startsWith(".") && e.name.endsWith(".yml"),
    )
    .map((e) => e.name)
    .sort()

  const requests = []
  for (const name of names) {
    let content
    try {
      content = await readFile(join(dir, name), "utf8")
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(`filestore.loadCollection: ${msg}`, { cause: e })
    }
    const reqId = name.slice(0, -4)
    try {
      requests.push(lang.parseRequest(reqId, content))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(
        `filestore.loadCollection: failed to parse "${name}": ${msg}`,
        { cause: e },
      )
    }
  }

  return { id, name: id, requests }
}
