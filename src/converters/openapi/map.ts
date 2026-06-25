import type { Collection } from "../../schema"

export interface Normalized {
  openapi: string
  info?: { title?: unknown }
  servers?: unknown
  paths: Record<string, unknown>
  security?: unknown
  components?: { securitySchemes?: unknown }
}

const FALLBACK_ID = "openapi-import"

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
}

function collectionName(n: Normalized): string {
  const t = n.info?.title
  return typeof t === "string" && t !== "" ? t : FALLBACK_ID
}

function urlTemplateToVar(s: string): string {
  return s.replace(/\{(\w+)\}/g, "{{$1}}")
}

function baseUrl(n: Normalized): string {
  const servers = n.servers
  if (!Array.isArray(servers) || servers.length === 0) return "/"
  const first = servers[0] as { url?: unknown } | null | undefined
  if (typeof first?.url !== "string" || first.url === "") return "/"
  return urlTemplateToVar(first.url)
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "")
  const p = path.startsWith("/") ? path : `/${path}`
  return `${b}${p}`
}

export const internals = {
  urlTemplateToVar,
  baseUrl,
  joinUrl,
}

export function mapCollection(n: Normalized): Collection {
  const name = collectionName(n)
  const id = slugify(name) || FALLBACK_ID
  return {
    id,
    name,
    requests: [],
  }
}
