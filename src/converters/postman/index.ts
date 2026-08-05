import { Collection as PmCollection } from "postman-collection"
import { detectPostman } from "./detect"
import { mapCollection } from "./map"

export {
  exportPostman,
  exportPostmanEnvironment,
  toPostmanTpl,
  type PostmanExportResult,
} from "./export"

export const postmanImporter = {
  type: "postman" as const,
  detect: detectPostman,
  import(content: string) {
    const parsed = JSON.parse(content)
    const col = new PmCollection(parsed as Record<string, unknown>)
    return mapCollection(col)
  },
}
