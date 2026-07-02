import type { ImportResult } from "../index"
import { parseSpec } from "./parse"
import { mapCollection } from "./map"

export interface OpenApiImporter {
  import(spec: string | object): ImportResult
}

export const openApiImporter: OpenApiImporter = {
  import(spec) {
    return mapCollection(parseSpec(spec))
  },
}

export { parseSpec } from "./parse"
export { mapCollection, type Normalized } from "./map"
