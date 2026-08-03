import type { Normalized } from "./map"
import { resolveSpecRefs } from "./refs"
import { parseJsonOrYaml } from "../shared"

export function parseSpec(spec: string | object): Normalized {
  let doc: unknown
  if (typeof spec === "string") {
    try {
      doc = parseJsonOrYaml(spec)
    } catch (eYaml) {
      const msg = eYaml instanceof Error ? eYaml.message : String(eYaml)
      throw new Error(
        `converters.openapi.import: failed to parse spec (not valid JSON or YAML): ${msg}`,
        { cause: eYaml },
      )
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

  const resolved = resolveSpecRefs(root) as Record<string, unknown>

  return {
    openapi,
    info: resolved.info as Normalized["info"],
    servers: resolved.servers,
    paths: resolved.paths as Record<string, unknown>,
    security: resolved.security,
    components: resolved.components as Normalized["components"],
  }
}
