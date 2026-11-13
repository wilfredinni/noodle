import type { Normalized } from "./map"
import { isMapping, localReferenceResolver, resolveSpecRefs } from "./refs"
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
  if (!/^3\.[01]\.(?:0|[1-9]\d*)$/.test(openapi)) {
    throw new Error(
      `converters.openapi.import: unsupported openapi version "${openapi}", expected 3.0.x or 3.1.x`,
    )
  }

  const paths = root.paths
  const version31 = openapi.startsWith("3.1.")
  if (
    !isMapping(paths) &&
    !(
      version31 &&
      paths === undefined &&
      (isMapping(root.webhooks) || isMapping(root.components))
    )
  ) {
    throw new Error('converters.openapi.import: missing or invalid "paths"')
  }

  const resolved = version31
    ? root
    : (resolveSpecRefs(root) as Record<string, unknown>)

  return {
    openapi,
    info: resolved.info as Normalized["info"],
    servers: resolved.servers,
    paths: (resolved.paths ?? {}) as Record<string, unknown>,
    security: resolved.security,
    components: resolved.components as Normalized["components"],
    ...(version31
      ? { resolveRef: localReferenceResolver(root), webhooks: root.webhooks }
      : {}),
  }
}
