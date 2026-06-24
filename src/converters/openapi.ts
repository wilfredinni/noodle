import type { Collection } from "../schema"

export interface OpenApiImporter {
  import(spec: string | object): Collection
}

export const openApiImporter: OpenApiImporter = {
  import() {
    throw new Error("converters.openapi.import: not implemented")
  },
}
