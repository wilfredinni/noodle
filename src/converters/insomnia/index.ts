import { detectInsomnia } from "./detect"
import { mapExport } from "./map"

export const insomniaImporter = {
  type: "insomnia" as const,
  detect: detectInsomnia,
  import(content: string) {
    let root: unknown
    try {
      root = JSON.parse(content)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(`converters.insomnia.import: invalid JSON: ${msg}`, {
        cause: e,
      })
    }
    if (typeof root !== "object" || root === null || Array.isArray(root)) {
      throw new Error(
        "converters.insomnia.import: export root must be an object",
      )
    }
    const doc = root as Record<string, unknown>
    if (
      doc._type !== "export" ||
      (doc.__export_format !== 4 && doc.__export_format !== 5)
    ) {
      throw new Error(
        "converters.insomnia.import: expected an Insomnia JSON v4 or v5 export",
      )
    }
    return mapExport(doc)
  },
}

export { detectInsomnia } from "./detect"
export { mapExport } from "./map"
