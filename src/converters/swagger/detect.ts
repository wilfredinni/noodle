import { parseJsonOrYaml } from "../shared"

export function detectSwagger(content: string): boolean {
  let doc: unknown
  try {
    doc = parseJsonOrYaml(content)
  } catch {
    return false
  }

  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    return false
  }
  const root = doc as Record<string, unknown>
  return (
    root.swagger === "2.0" &&
    typeof root.paths === "object" &&
    root.paths !== null &&
    !Array.isArray(root.paths)
  )
}
