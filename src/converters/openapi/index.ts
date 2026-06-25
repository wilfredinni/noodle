import type { Collection } from "../../schema"
import { parseSpec } from "./parse"
import { mapCollection } from "./map"

export interface OpenApiImporter {
  import(spec: string | object): Collection
}

export const openApiImporter: OpenApiImporter = {
  import(spec) {
    return mapCollection(parseSpec(spec))
  },
}

export { parseSpec } from "./parse"
export { mapCollection, internals, type Normalized } from "./map"
