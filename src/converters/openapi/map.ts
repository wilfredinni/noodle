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

export function mapCollection(n: Normalized): Collection {
  const name = collectionName(n)
  const id = slugify(name) || FALLBACK_ID
  return {
    id,
    name,
    requests: [],
  }
}
