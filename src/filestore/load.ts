import { lstat, readdir, readFile, realpath, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"
import * as yaml from "js-yaml"
import { lang } from "../lang"
import type {
  Collection,
  CollectionItem,
  CollectionSettings,
  Folder,
  Request,
} from "../schema"

const SKIP_DIRS = new Set([".noodle", ".timeline", ".git", "node_modules"])

export interface LoadOptions {
  readOnly?: boolean
  tolerant?: boolean
}

async function walk(
  absDir: string,
  relPath: string,
  visited = new Set<string>(),
  root?: string,
  opts: LoadOptions = {},
): Promise<CollectionItem[]> {
  let resolved: string
  try {
    const stat = await lstat(absDir)
    if (stat.isSymbolicLink()) {
      resolved = await realpath(absDir)
    } else if (root !== undefined) {
      resolved = relPath ? join(root, relPath) : root
    } else {
      resolved = absDir
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`filestore.loadCollection: ${msg}`, { cause: e })
  }
  if (
    root !== undefined &&
    resolved !== root &&
    !resolved.startsWith(root + "/")
  ) {
    return []
  }
  if (visited.has(resolved)) return []
  visited.add(resolved)

  let entries
  try {
    entries = await readdir(absDir, { withFileTypes: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`filestore.loadCollection: ${msg}`, { cause: e })
  }

  const folders: { item: CollectionItem; seq?: number }[] = []
  const requests: { item: CollectionItem; name: string }[] = []

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      const childRel = relPath ? `${relPath}/${entry.name}` : entry.name
      const childAbs = join(absDir, entry.name)

      let folderMeta: {
        meta?: import("../schema").FolderMeta
        overrides?: import("../schema").FolderOverrides
      } = {}
      let folderYmlContent = ""
      try {
        folderYmlContent = await readFile(join(childAbs, "folder.yml"), "utf8")
      } catch {
        // folder.yml is optional
      }
      if (folderYmlContent) {
        try {
          folderMeta = lang.parseFolder(folderYmlContent)
        } catch {
          // ignore invalid folder.yml, use defaults
        }
      }

      const children = await walk(childAbs, childRel, visited, root, opts)
      const folder: Folder = {
        id: entry.name,
        name: folderMeta.meta?.name ?? entry.name,
        path: childRel,
        seq: folderMeta.meta?.seq,
        overrides: folderMeta.overrides,
        children,
      }
      folders.push({ item: { type: "folder", data: folder }, seq: folder.seq })
    } else if (entry.isFile()) {
      if (!entry.name.endsWith(".yml")) continue
      if (entry.name === "settings.yml" || entry.name === "folder.yml") continue

      let content: string
      try {
        content = await readFile(join(absDir, entry.name), "utf8")
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        throw new Error(`filestore.loadCollection: ${msg}`, { cause: e })
      }

      const reqName = entry.name.slice(0, -4)
      const reqId = relPath ? `${relPath}/${reqName}` : reqName
      let req: Request
      try {
        req = lang.parseRequest(reqId, content)
      } catch (e) {
        if (opts.tolerant) continue
        const msg = e instanceof Error ? e.message : String(e)
        throw new Error(
          `filestore.loadCollection: failed to parse "${entry.name}": ${msg}`,
          { cause: e },
        )
      }
      requests.push({ item: { type: "request", data: req }, name: entry.name })

      if (!opts.readOnly && !/^timeout:\s/m.test(content)) {
        try {
          await writeFile(
            join(absDir, entry.name),
            lang.serializeRequest(req),
            "utf8",
          )
        } catch {
          /* migration non-critical */
        }
      }
    }
  }

  folders.sort((a, b) => {
    const sa = a.seq
    const sb = b.seq
    if (sa !== undefined && sb !== undefined) return sa - sb
    if (sa !== undefined) return -1
    if (sb !== undefined) return 1
    return (a.item.data as Folder).name.localeCompare(
      (b.item.data as Folder).name,
    )
  })
  requests.sort((a, b) => a.name.localeCompare(b.name))

  return [...folders.map((f) => f.item), ...requests.map((r) => r.item)]
}

export async function loadCollection(dir: string): Promise<Collection> {
  try {
    await readdir(dir, { withFileTypes: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `filestore.loadCollection: directory not found "${dir}"`,
        {
          cause: e,
        },
      )
    }
    throw new Error(`filestore.loadCollection: ${msg}`, { cause: e })
  }

  const id = basename(dir)
  const root = await realpath(dir)
  const items = await walk(dir, "", new Set(), root)
  return { id, name: id, items }
}

export async function loadCollectionBrowse(dir: string): Promise<Collection> {
  const id = basename(dir)
  try {
    const root = await realpath(dir)
    const items = await walk(dir, "", new Set(), root, {
      readOnly: true,
      tolerant: true,
    })
    return { id, name: id, items }
  } catch {
    return { id, name: id, items: [] }
  }
}

export async function loadSettings(dir: string): Promise<CollectionSettings> {
  const filePath = join(dir, "settings.yml")
  let raw: string
  try {
    raw = await readFile(filePath, "utf8")
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {}
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`filestore.loadSettings: ${msg}`, { cause: e })
  }
  try {
    const data = yaml.load(raw)
    if (!data || typeof data !== "object") return {}
    const obj = data as Record<string, unknown>
    return {
      environment:
        typeof obj.environment === "string" ? obj.environment : undefined,
    }
  } catch {
    return {}
  }
}
