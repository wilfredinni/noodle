// Bundled for execution inside QuickJS by scripts/build-schema-validator.ts.
import Ajv from "ajv"
import addFormats from "ajv-formats"

const ajv = new Ajv({
  strictTypes: false,
  strictTuples: false,
  strictRequired: false,
  logger: false,
  addUsedSchema: false,
  ownProperties: true,
})
addFormats(ajv)
const dialect = /^https?:\/\/json-schema\.org\/draft-07\/schema#?$/
const single = [
  "additionalItems",
  "additionalProperties",
  "contains",
  "propertyNames",
  "not",
  "if",
  "then",
  "else",
]
const maps = [
  "properties",
  "patternProperties",
  "definitions",
  "$defs",
  "dependencies",
]
const lists = ["allOf", "anyOf", "oneOf"]

function checkSchema(schema: unknown): void {
  if (typeof schema === "boolean") return
  if (!schema || typeof schema !== "object" || Array.isArray(schema))
    throw Error("JSON Schema must be an object or boolean")
  const value = schema as Record<string, unknown>
  if (value.$schema !== undefined) {
    if (typeof value.$schema !== "string" || !dialect.test(value.$schema))
      throw Error("Only JSON Schema draft-07 is supported")
    value.$schema = "http://json-schema.org/draft-07/schema#"
  }
  if (
    value.$ref !== undefined &&
    (typeof value.$ref !== "string" || !value.$ref.startsWith("#"))
  )
    throw Error("JSON Schema references must be local fragments")
  if (value.$async !== undefined)
    throw Error("Async JSON Schema validators are not supported")
  for (const key of single)
    if (value[key] !== undefined) checkSchema(value[key])
  for (const key of maps) {
    const entries = value[key]
    if (entries && typeof entries === "object" && !Array.isArray(entries))
      for (const child of Object.values(entries))
        if (!(key === "dependencies" && Array.isArray(child)))
          checkSchema(child)
  }
  for (const key of [...lists, "items"]) {
    const children = value[key]
    if (Array.isArray(children)) children.forEach(checkSchema)
    else if (key === "items" && children !== undefined) checkSchema(children)
  }
}

// This temporary global is captured and removed before user code executes.
Object.defineProperty(globalThis, "__noodleMatchSchema", {
  configurable: true,
  value: (data: unknown, schema: object | boolean) => {
    checkSchema(schema)
    const validate = ajv.compile(schema)
    try {
      if (validate(data)) return null
      const error = validate.errors?.[0]
      return `${error?.instancePath || "/"}: ${error?.keyword ?? "schema"} ${error?.message ?? "validation failed"}`
    } finally {
      if (typeof schema === "object") ajv.removeSchema(schema)
    }
  },
})
