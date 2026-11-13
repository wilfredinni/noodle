import { detectOpenApi } from "./detect"
import { parseSpec } from "./parse"
import { mapCollection } from "./map"

export const openApiImporter = {
  type: "openapi",
  detect: detectOpenApi,
  import(content: string) {
    const spec = parseSpec(content)
    const result = mapCollection(spec)
    if (spec.resolveRef && !result.collection.items.length)
      throw new Error(
        "Nothing to import: this OpenAPI 3.1 document has no supported path operations. Components and webhooks alone do not define outgoing requests.",
      )
    return result
  },
}

export { parseSpec } from "./parse"
export {
  exportOpenApi,
  type OpenApiExportOptions,
  type OpenApiExportResult,
} from "./export"
export {
  mapCollection,
  convertTpl,
  slugify,
  urlTemplateToVar,
  pathTemplateToColon,
  baseUrl,
  joinUrl,
  paramDefault,
  makeIdRaw,
  type Normalized,
} from "./map"
