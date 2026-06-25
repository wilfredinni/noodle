import type { Collection } from "../../schema"

export interface Normalized {
  openapi: string
  info?: { title?: unknown }
  servers?: unknown
  paths: Record<string, unknown>
  security?: unknown
  components?: { securitySchemes?: unknown }
}

export function mapCollection(_n: Normalized): Collection {
  throw new Error("converters.openapi.import: not implemented")
}
