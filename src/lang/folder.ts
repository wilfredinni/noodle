import yaml from "js-yaml"
import type { Auth, Folder, FolderMeta, FolderOverrides } from "../schema"
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
      overrides.auth = parseFolderAuth(raw.auth)
    }
  }

  return { meta, overrides }
}

type RawFolderAuth =
  | { type: "none"; [k: string]: unknown }
  | { type: "bearer"; token: string; [k: string]: unknown }
  | { type: "basic"; user: string; pass: string; [k: string]: unknown }
  | {
      type: "api_key"
      key: string
      value: string
      placement?: string
      [k: string]: unknown
    }
  | { type: string; [k: string]: unknown }

function parseFolderAuth(value: unknown): Auth {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error('lang.parseFolder: "auth" must be a mapping')
  }
  const a = value as RawFolderAuth
  if (a.type === "none") return { type: "none" }
  if (a.type === "bearer") {
    if (typeof a.token !== "string")
      throw new Error('lang.parseFolder: auth.bearer requires "token"')
    return { type: "bearer", token: a.token }
  }
  if (a.type === "basic") {
    if (typeof a.user !== "string" || typeof a.pass !== "string") {
      throw new Error('lang.parseFolder: auth.basic requires "user" and "pass"')
    }
    return { type: "basic", user: a.user, pass: a.pass }
  }
  if (a.type === "api_key") {
    if (typeof a.key !== "string" || typeof a.value !== "string") {
      throw new Error(
        'lang.parseFolder: auth.api_key requires "key" and "value"',
      )
    }
    if (
      a.placement !== undefined &&
      a.placement !== "header" &&
      a.placement !== "query"
    ) {
      throw new Error(
        `lang.parseFolder: auth.api_key placement must be "header" or "query", got "${String(a.placement)}"`,
      )
    }
    const placement = a.placement === "query" ? "query" : "header"
    return { type: "api_key", key: a.key, value: a.value, placement }
  }
  throw new Error(`lang.parseFolder: invalid auth.type "${String(a.type)}"`)
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
      out += "auth:\n"
      if (o.auth.type === "none") {
        out += "  type: none\n"
      } else if (o.auth.type === "bearer") {
        out += "  type: bearer\n"
        out += `  token: ${yamlVal(o.auth.token, 2)}\n`
      } else if (o.auth.type === "basic") {
        out += "  type: basic\n"
        out += `  user: ${yamlVal(o.auth.user, 2)}\n`
        out += `  pass: ${yamlVal(o.auth.pass, 2)}\n`
      } else if (o.auth.type === "api_key") {
        out += "  type: api_key\n"
        out += `  key: ${yamlVal(o.auth.key, 2)}\n`
        out += `  value: ${yamlVal(o.auth.value, 2)}\n`
        out += `  placement: ${o.auth.placement}\n`
      }
    }
  }

  return out
}
