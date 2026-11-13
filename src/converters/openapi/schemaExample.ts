import { isMapping, type localReferenceResolver } from "./refs"

export type ResolveRef = ReturnType<typeof localReferenceResolver>
class TemplateError extends Error {}
class RecursiveSchema extends TemplateError {}

export type Warn = (field: string, message: string) => void

// Examples enter Noodle as editable request text. Escape dollars before substitution.
export function literalText(value: string): string {
  return value.replaceAll("$", () => "$$")
}

export function explicitExample(
  object: Record<string, unknown>,
  resolve: ResolveRef,
  unavailable: () => void,
): unknown {
  if (Object.hasOwn(object, "example")) return object.example
  if (isMapping(object.examples)) {
    for (const entry of Object.values(object.examples)) {
      const example = resolve(entry)
      if (isMapping(example) && Object.hasOwn(example, "value"))
        return example.value
      unavailable()
    }
  }
  return undefined
}

export function jsonBody31(
  media: Record<string, unknown>,
  resolve: ResolveRef,
  warn: Warn,
): string | undefined {
  const problem = (message: string) => warn("requestBody", message)
  const explicit = explicitExample(media, resolve, () =>
    problem("A body example could not be resolved locally."),
  )
  let count = 0
  const active = new Set<object>()
  const sample = (value: unknown): unknown => {
    const schema = resolve(value, true)
    if (++count > 10000 || active.size >= 64)
      throw new TemplateError(
        "Schema exceeds the body template limit. Edit the body.",
      )
    if (
      isMapping(value) &&
      typeof value.$ref === "string" &&
      schema === undefined
    )
      throw new TemplateError(
        "A body reference could not be resolved locally. Edit the body.",
      )
    if (schema === false)
      throw new TemplateError(
        "The request schema allows no value. Review the body.",
      )
    if (!isMapping(schema)) return {}
    if (Array.isArray(schema.examples) && schema.examples.length)
      return schema.examples[0]
    for (const key of ["example", "const", "default"])
      if (Object.hasOwn(schema, key)) return schema[key]
    if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0]

    if (active.has(schema))
      throw new RecursiveSchema(
        "Recursive schema needs a finite body example. Edit the body.",
      )
    active.add(schema)
    try {
      const union = schema.anyOf ?? schema.oneOf
      if (Array.isArray(union)) {
        const options = union.filter((branch) => {
          const option = resolve(branch, true)
          return !(isMapping(option) && option.type === "null")
        })
        if (!options.length && union.length) return null
        if (options.length === 1) {
          try {
            return sample(options[0])
          } catch (error) {
            if (
              error instanceof RecursiveSchema &&
              options.length < union.length
            )
              return null
            throw error
          }
        }
        throw new TemplateError(
          "Multiple schema alternatives require a body example. Edit the body.",
        )
      }
      if (schema.allOf)
        throw new TemplateError(
          "Composed schema requires a body example. Edit the body.",
        )
      const types = Array.isArray(schema.type)
        ? schema.type.filter((type) => type !== "null")
        : [schema.type]
      if (types.length > 1)
        throw new TemplateError(
          "Multiple schema types require a body example. Edit the body.",
        )
      const type = types[0]
      if (!types.length || type === "null") return null
      if (type === "array" || schema.items) {
        if (schema.items === undefined || schema.items === false) return []
        try {
          return [sample(schema.items)]
        } catch (error) {
          if (
            error instanceof RecursiveSchema &&
            !(Number(schema.minItems) > 0)
          )
            return []
          throw error
        }
      }
      if (isMapping(schema.properties)) {
        const entries: [string, unknown][] = []
        for (const [name, property] of Object.entries(schema.properties)) {
          const resolved = resolve(property, true)
          if (isMapping(resolved) && resolved.readOnly === true) continue
          try {
            entries.push([name, sample(property)])
          } catch (error) {
            if (
              !(error instanceof RecursiveSchema) ||
              (Array.isArray(schema.required) && schema.required.includes(name))
            )
              throw error
          }
        }
        return Object.fromEntries(entries)
      }
      if (type === "number" || type === "integer") return 0
      if (type === "boolean") return false
      if (type === "string") return ""
      return {}
    } finally {
      active.delete(schema)
    }
  }
  try {
    const value = explicit === undefined ? sample(media.schema) : explicit
    // YAML aliases can be cyclic or expand exponentially during JSON serialization.
    let bytes = 0
    const json = JSON.stringify(value, (key, entry: unknown) => {
      bytes += key.length + (typeof entry === "string" ? entry.length : 1)
      if (++count > 100_000 || bytes > 5 * 1024 * 1024)
        throw new TemplateError(
          "Example exceeds the body template limit. Edit the body.",
        )
      return entry
    })
    return literalText(json)
  } catch (error) {
    problem(
      error instanceof TemplateError
        ? error.message
        : "Example cannot be represented as JSON. Edit the body.",
    )
    return undefined
  }
}
