import yaml from "js-yaml"
import type { Normalized } from "./map"

export function parseSpec(spec: string | object): Normalized {
  let doc: unknown
  if (typeof spec === "string") {
    try {
      doc = JSON.parse(spec)
    } catch {
      try {
        doc = yaml.load(spec)
      } catch (eYaml) {
        const msg = eYaml instanceof Error ? eYaml.message : String(eYaml)
        throw new Error(
          `converters.openapi.import: failed to parse spec (not valid JSON or YAML): ${msg}`,
          { cause: eYaml },
        )
      }
    }
  } else {
    doc = spec
  }

  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    throw new Error("converters.openapi.import: spec root must be a mapping")
  }
  const root = doc as Record<string, unknown>

  const openapi = root.openapi
  if (typeof openapi !== "string") {
    throw new Error('converters.openapi.import: missing "openapi" field')
  }
  if (!openapi.startsWith("3.0")) {
    throw new Error(
      `converters.openapi.import: unsupported openapi version "${openapi}", expected 3.0.x`,
    )
  }

  const paths = root.paths
  if (typeof paths !== "object" || paths === null || Array.isArray(paths)) {
    throw new Error('converters.openapi.import: missing or invalid "paths"')
  }

  return {
    openapi,
    info: root.info as Normalized["info"],
    servers: root.servers,
    paths: paths as Record<string, unknown>,
    security: root.security,
    components: root.components as Normalized["components"],
  }
}
