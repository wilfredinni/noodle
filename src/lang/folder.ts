import yaml from "js-yaml"
import type { Folder, FolderMeta, FolderOverrides } from "../schema"
import { authToObj, parseAuth } from "./auth"
import { parseKvMap } from "./parse"

interface RawFolderMeta {
  name?: unknown
  seq?: unknown
}

interface RawFolder {
  meta?: unknown
  headers?: unknown
  auth?: unknown
  [k: string]: unknown
}

export function parseFolder(yamlText: string): {
  meta?: FolderMeta
  overrides?: FolderOverrides
} {
  let doc: unknown
  try {
    doc = yaml.load(yamlText)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`lang.parseFolder: YAML syntax: ${msg}`, { cause: e })
  }

  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    throw new Error("lang.parseFolder: expected a YAML mapping at top level")
  }

  const raw = doc as RawFolder

  const knownKeys = new Set(["meta", "headers", "auth"])
  for (const key of Object.keys(raw)) {
    if (!knownKeys.has(key)) {
      throw new Error(`lang.parseFolder: unknown field "${key}"`)
    }
  }

  let meta: FolderMeta | undefined
  if (raw.meta !== undefined) {
    if (
      typeof raw.meta !== "object" ||
      raw.meta === null ||
      Array.isArray(raw.meta)
    ) {
      throw new Error('lang.parseFolder: "meta" must be a mapping')
    }
    const m = raw.meta as RawFolderMeta
    meta = {}
    if (typeof m.name === "string") meta.name = m.name
    if (typeof m.seq === "number") meta.seq = m.seq
  }

  let overrides: FolderOverrides | undefined
  if (raw.headers !== undefined || raw.auth !== undefined) {
    overrides = {}
    if (raw.headers !== undefined) {
      overrides.headers = parseKvMap(raw.headers, "headers", "lang.parseFolder")
    }
    if (raw.auth !== undefined) {
      overrides.auth = parseAuth(raw.auth, "lang.parseFolder", false)
    }
  }

  return { meta, overrides }
}

function yamlVal(val: string, indent = 0): string {
  const dumped = yaml.dump(val, { lineWidth: -1 }).trim()
  if (indent === 0 || !dumped.includes("\n")) {
    return dumped
  }
  const lines = dumped.split("\n")
  const pad = " ".repeat(indent)
  return [lines[0], ...lines.slice(1).map((l) => pad + l)].join("\n")
}

export function serializeFolder(folder: Folder): string {
  let out = ""

  if (folder.seq !== undefined || folder.name !== folder.id) {
    out += "meta:\n"
    if (folder.name !== folder.id) {
      out += `  name: ${yamlVal(folder.name, 2)}\n`
    }
    if (folder.seq !== undefined) {
      out += `  seq: ${String(folder.seq)}\n`
    }
  }

  if (folder.overrides) {
    const o = folder.overrides
    if (o.headers && Object.keys(o.headers).length > 0) {
      out += "headers:\n"
      for (const [k, v] of Object.entries(o.headers)) {
        const key = yamlVal(k, 2)
        const val = yamlVal(v.value, 2)
        if (v.enabled) {
          out += `  ${key}: ${val}\n`
        } else {
          out += `  ${key}: { value: ${val}, enabled: false }\n`
        }
      }
    }
    if (o.auth) {
      out += yaml.dump(
        { auth: authToObj(o.auth) },
        { lineWidth: -1, noRefs: true },
      )
    }
  }

  return out
}
