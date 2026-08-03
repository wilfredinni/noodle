export function detectInsomnia(content: string): boolean {
  let doc: unknown
  try {
    doc = JSON.parse(content)
  } catch {
    return false
  }

  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    return false
  }

  const root = doc as Record<string, unknown>
  return (
    root._type === "export" &&
    (root.__export_format === 4 || root.__export_format === 5) &&
    Array.isArray(root.resources)
  )
}
