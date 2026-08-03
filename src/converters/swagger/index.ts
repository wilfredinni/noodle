import { detectSwagger } from "./detect"
import { parseSwaggerSpec } from "./parse"
import { mapCollection } from "../openapi/map"

export const swaggerImporter = {
  type: "swagger" as const,
  detect: detectSwagger,
  import(content: string) {
    return mapCollection(parseSwaggerSpec(content))
  },
}

export { parseSwaggerSpec } from "./parse"
