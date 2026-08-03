import { detectOpenApi } from "./detect"
import { parseSpec } from "./parse"
import { mapCollection } from "./map"

export const openApiImporter = {
  type: "openapi",
  detect: detectOpenApi,
  import(content: string) {
    return mapCollection(parseSpec(content))
  },
}

export { parseSpec } from "./parse"
export { exportOpenApi, type OpenApiExportResult } from "./export"
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
