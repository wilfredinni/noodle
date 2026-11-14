function resolvePointer(root: Record<string, unknown>, ref: string): unknown {
  let pointer: string
  try {
    pointer = decodeURIComponent(ref.slice(1))
  } catch {
    return undefined
  }
  const parts = pointer.slice(1).split("/")
  let current: unknown = root
  for (const part of parts) {
    const key = part.replace(/~1/g, "/").replace(/~0/g, "~")
    if (
      typeof current === "object" &&
      current !== null &&
      Object.hasOwn(current, key)
    ) {
      current = (current as Record<string, unknown>)[key]
    } else {
      return undefined
    }
  }
  return current
}

export function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const schemaAnnotations = new Set([
  "examples",
  "example",
  "default",
  "title",
  "description",
  "readOnly",
  "writeOnly",
  "deprecated",
  "$comment",
])

export function hasSchemaSiblings(
  schema: Record<string, unknown>,
  keyword: string,
) {
  return Object.keys(schema).some(
    (key) =>
      key !== keyword && !schemaAnnotations.has(key) && !key.startsWith("x-"),
  )
}

// Resolve only references at OpenAPI object or schema positions. Examples are data.
export function localReferenceResolver(root: Record<string, unknown>) {
  return (value: unknown, schema: boolean | "template" = false): unknown => {
    const seen = new Set<object>()
    const annotations: Record<string, unknown> = {}
    const siblings: Record<string, unknown>[] = []
    let composition = false
    while (isMapping(value) && typeof value.$ref === "string") {
      if (!value.$ref.startsWith("#/") || seen.has(value)) return undefined
      seen.add(value)
      if (schema) {
        if (schema === "template" && !composition)
          for (const key of schemaAnnotations) {
            if (Object.hasOwn(value, key) && !Object.hasOwn(annotations, key))
              annotations[key] = value[key]
          }
        const adjacent = { ...value }
        delete adjacent.$ref
        siblings.push(adjacent)
        composition ||= hasSchemaSiblings(value, "$ref")
      }
      value = resolvePointer(root, value.$ref)
    }
    if (schema && siblings.length && (isMapping(value) || value === true)) {
      const allOf = [value, ...siblings]
      if (schema === "template" && composition) return { allOf, ...annotations }
      let resolved = isMapping(value) ? value : {}
      for (const adjacent of siblings.toReversed())
        resolved = { ...resolved, ...adjacent }
      // Keep every constraint alongside the fields read by import metadata consumers.
      return composition ? { ...resolved, allOf } : resolved
    }
    return value
  }
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
      visited.delete(refPath)
      return obj
    }

    const result: Record<string, unknown> = Object.create(null)
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
