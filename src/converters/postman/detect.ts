export function detectPostman(content: string): boolean {
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

  const info = root.info
  if (typeof info === "object" && info !== null && !Array.isArray(info)) {
    const infoObj = info as Record<string, unknown>
    const schema = infoObj.schema

    if (typeof schema === "string") {
      if (schema.includes("getpostman.com/json/collection/")) {
        return true
      }
      return false
    }

    if (
      typeof infoObj.name === "string" &&
      Array.isArray(root.item) &&
      root.item.some(
        (i: unknown) =>
          typeof i === "object" &&
          i !== null &&
          !Array.isArray(i) &&
          (("request" in (i as Record<string, unknown>)) ||
            ("item" in (i as Record<string, unknown>))),
      )
    ) {
      return true
    }
  }

  return false
}
