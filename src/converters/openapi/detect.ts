import { parseJsonOrYaml } from "../shared"
import { isMapping } from "./refs"

export function detectOpenApi(content: string): boolean {
  let doc: unknown
  try {
    doc = parseJsonOrYaml(content)
  } catch {
    return false
  }

  if (typeof doc !== "object" || doc === null || Array.isArray(doc))
    return false
  const root = doc as Record<string, unknown>
  const version = root.openapi
  if (typeof version !== "string") return false

  return (
    isMapping(root.paths) ||
    (version.startsWith("3.1.") &&
      root.paths === undefined &&
      (isMapping(root.webhooks) || isMapping(root.components)))
  )
}
