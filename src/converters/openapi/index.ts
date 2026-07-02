import { registerImporter } from "../index"
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

registerImporter(openApiImporter)

export { parseSpec } from "./parse"
export { mapCollection, type Normalized } from "./map"
