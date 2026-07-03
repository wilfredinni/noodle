import yaml from "js-yaml"

export function detectOpenApi(content: string): boolean {
  let doc: unknown
  try {
    doc = JSON.parse(content)
  } catch {
    try {
      doc = yaml.load(content)
    } catch {
      return false
    }
  }

  if (typeof doc !== "object" || doc === null || Array.isArray(doc))
    return false
  const root = doc as Record<string, unknown>
  const version = root.openapi ?? root.swagger
  if (typeof version !== "string") return false

  return (
    typeof root.paths === "object" &&
    root.paths !== null &&
    !Array.isArray(root.paths)
  )
}
