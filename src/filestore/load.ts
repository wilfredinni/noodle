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
import { parseCollectionProxyStrict } from "../proxy"
import { parseCollectionTlsStrict } from "../tls"

export interface CollectionFileError {
  file: string
  message: string
  rawError: string
  snippet?: string
}

export function parseUserFriendlyFileError(
  file: string,
  rawError: string,
): CollectionFileError {
  let msg = rawError
    .replace(/^filestore\.loadCollection:\s*/, "")
    .replace(/^failed to parse "[^"]+":\s*/, "")
    .replace(/^lang\.parseRequest:\s*/, "")
    .replace(/^lang\.parseFolder:\s*/, "")
    .replace(/^YAML syntax:\s*/, "")
    .trim()

  let snippet: string | undefined
  const snippetIdx = msg.search(/\n\s*\d+\s*\|/)
  if (snippetIdx !== -1) {
    snippet = msg.slice(snippetIdx).trim()
    msg = msg.slice(0, snippetIdx).trim()
  }

  const posMatch = msg.match(/\((\d+):(\d+)\)$/)
  let locationPrefix = ""
  if (posMatch) {
    const line = posMatch[1]
    const col = posMatch[2]
    locationPrefix = `Line ${line}, Col ${col}: `
    msg = msg.replace(/\s*\(\d+:\d+\)$/, "").trim()
  }

  if (
    msg.includes("can not read an implicit mapping pair; a colon is missed")
  ) {
    msg = "Missing colon after key name"
  } else if (msg.includes("bad indentation of a mapping entry")) {
    msg = "Bad indentation of YAML entry"
  } else if (
    msg.includes("end of the stream or a document separator is expected")
  ) {
    msg = "Unexpected YAML formatting or structure"
  } else if (msg.includes("duplicated mapping key")) {
    msg = "Duplicate key in YAML mapping"
  } else if (msg.includes("incomplete explicit mapping pair")) {
    msg = "Incomplete mapping pair"
  }

  return {
    file,
    message: locationPrefix ? `${locationPrefix}${msg}` : msg,
    rawError,
    snippet,
  }
}

export function extractFileErrors(error: Error): CollectionFileError[] {
  if (
    Array.isArray(
      (error as unknown as { fileErrors?: CollectionFileError[] }).fileErrors,
    ) &&
    (error as unknown as { fileErrors: CollectionFileError[] }).fileErrors
      .length > 0
  ) {
    return (error as unknown as { fileErrors: CollectionFileError[] })
      .fileErrors
  }
  const fileMatch = error.message.match(
    /failed to parse "([^"]+)":\s*([\s\S]+)/,
  )
  if (fileMatch) {
    return [parseUserFriendlyFileError(fileMatch[1], fileMatch[2])]
  }
  return [
    {
      file: "collection",
      message: error.message.replace(/^filestore\.loadCollection:\s*/, ""),
      rawError: error.message,
    },
  ]
}

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
  fileErrors: CollectionFileError[] = [],
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
        } catch (e) {
          if (!opts.tolerant) {
            const msg = e instanceof Error ? e.message : String(e)
            const folderYmlRel = `${childRel}/folder.yml`
            fileErrors.push(parseUserFriendlyFileError(folderYmlRel, msg))
          }
        }
      }

      const children = await walk(
        childAbs,
        childRel,
        visited,
        root,
        opts,
        fileErrors,
      )
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
        requests.push({
          item: { type: "request", data: req },
          name: entry.name,
        })
      } catch (e) {
        if (opts.tolerant) continue
        const msg = e instanceof Error ? e.message : String(e)
        const relFileName = relPath ? `${relPath}/${entry.name}` : entry.name
        fileErrors.push(parseUserFriendlyFileError(relFileName, msg))
      }

      if (requests.length > 0 && !opts.readOnly) {
        const lastReq = requests[requests.length - 1].item.data as Request
        if (lastReq.id === reqId && !/^timeout:\s/m.test(content)) {
          try {
            await writeFile(
              join(absDir, entry.name),
              lang.serializeRequest(lastReq),
              "utf8",
            )
          } catch {
            /* migration non-critical */
          }
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

export async function loadCollection(
  dir: string,
  options: LoadOptions = {},
): Promise<Collection> {
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
  const fileErrors: CollectionFileError[] = []
  const items = await walk(dir, "", new Set(), root, options, fileErrors)

  if (fileErrors.length > 0) {
    const first = fileErrors[0]
    const errMsg =
      fileErrors.length === 1
        ? `filestore.loadCollection: failed to parse "${first.file}": ${first.rawError}`
        : `filestore.loadCollection: ${fileErrors.length} files failed to parse in collection:\n` +
          fileErrors.map((f) => `• ${f.file}: ${f.message}`).join("\n")
    const err = new Error(errMsg)
    ;(err as unknown as { fileErrors: CollectionFileError[] }).fileErrors =
      fileErrors
    throw err
  }

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
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return { id, name: id, items: [] }
    }
    throw e
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
    if (!raw.trim()) return {}
    const data = yaml.load(raw)
    return parseCollectionSettings(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`filestore.loadSettings: ${msg}`, { cause: e })
  }
}

export function parseCollectionSettings(value: unknown): CollectionSettings {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error("settings.yml: expected a mapping")
  }
  const obj = value as Record<string, unknown>
  const allowed = new Set([
    "collection_id",
    "name",
    "description",
    "timeline_max_entries",
    "environment",
    "proxy",
    "tls",
  ])
  const unknownKey = Object.keys(obj).find((key) => !allowed.has(key))
  if (unknownKey) {
    throw new Error(`settings.yml: unknown key "${unknownKey}"`)
  }

  const settings: CollectionSettings = {}
  if (obj.collection_id !== undefined) {
    if (
      typeof obj.collection_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        obj.collection_id,
      )
    ) {
      throw new Error("settings.yml: collection_id must be a UUID")
    }
    settings.collectionId = obj.collection_id
  }
  if (obj.name !== undefined) {
    if (typeof obj.name !== "string") {
      throw new Error("settings.yml: name must be a string")
    }
    if (obj.name.trim()) settings.name = obj.name.trim()
  }
  if (obj.description !== undefined) {
    if (typeof obj.description !== "string") {
      throw new Error("settings.yml: description must be a string")
    }
    if (obj.description.trim()) settings.description = obj.description.trim()
  }
  if (obj.timeline_max_entries !== undefined) {
    if (
      typeof obj.timeline_max_entries !== "number" ||
      !Number.isSafeInteger(obj.timeline_max_entries) ||
      obj.timeline_max_entries < 0
    ) {
      throw new Error(
        "settings.yml: timeline_max_entries must be a non-negative integer",
      )
    }
    settings.timelineMaxEntries = obj.timeline_max_entries
  }
  if (obj.environment !== undefined) {
    if (typeof obj.environment !== "string") {
      throw new Error("settings.yml: environment must be a string")
    }
    settings.environment = obj.environment
  }
  if (obj.proxy !== undefined) {
    settings.proxy = parseCollectionProxyStrict(obj.proxy)
  }
  if (obj.tls !== undefined) {
    settings.tls = parseCollectionTlsStrict(obj.tls)
  }
  return settings
}
