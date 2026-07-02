function resolvePointer(root: Record<string, unknown>, ref: string): unknown {
  const parts = ref.slice(2).split("/")
  let current: unknown = root
  for (const part of parts) {
    if (typeof current === "object" && current !== null) {
      current = (current as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return current
}

function resolveRefs(
  doc: unknown,
  root?: Record<string, unknown>,
  visited?: Set<string>,
  cache?: Map<string, unknown>,
): unknown {
  if (root === undefined) {
    if (typeof doc !== "object" || doc === null) return doc
    root = doc as Record<string, unknown>
  }
  if (visited === undefined) visited = new Set()
  if (cache === undefined) cache = new Map()

  if (Array.isArray(doc)) {
    return doc.map((item) => resolveRefs(item, root, visited, cache))
  }

  if (typeof doc === "object" && doc !== null) {
    const obj = doc as Record<string, unknown>

    if (typeof obj.$ref === "string" && obj.$ref.startsWith("#/")) {
      const refPath = obj.$ref
      const cached = cache.get(refPath)
      if (cached !== undefined) return cached

      if (visited.has(refPath)) {
        return { circular: true, ref: refPath }
      }
      visited.add(refPath)
      const resolved = resolvePointer(root, refPath)
      if (resolved !== undefined) {
        const result = resolveRefs(resolved, root, visited, cache)
        visited.delete(refPath)
        cache.set(refPath, result)
        return result
      }
      return obj
    }

    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveRefs(value, root, visited, cache)
    }
    return result
  }

  return doc
}

export function resolveSpecRefs(spec: object): object {
  return resolveRefs(spec) as object
}
