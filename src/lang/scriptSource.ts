import type { ScriptFields } from "../schema"

export function isExternalScriptSource(source: string): boolean {
  const literal = source.trim()
  return (
    /^[\w.@~\\/-]+\.(?:[cm]?js|ts)$/.test(literal) ||
    (/^(?:file:\/\/|\.{1,2}[\\/]|[~@][\\/]|[a-zA-Z]:[\\/]|\\|\/(?![/*]))[^\r\n;{}()'"`]+$/.test(
      literal,
    ) &&
      !/^\/.*\/[dgimsuvy]*$/.test(literal))
  )
}

export function parseScripts(
  value: unknown,
  prefix = "lang.parseRequest",
): ScriptFields["scripts"] {
  if (value === undefined) return undefined
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${prefix}: "scripts" must be a mapping`)
  }
  const keys = Object.keys(value)
  if (keys.length === 0) {
    throw new Error(`${prefix}: "scripts" must contain "pre" or "post"`)
  }
  for (const key of keys) {
    if (key !== "pre" && key !== "post") {
      throw new Error(`${prefix}: unknown scripts field "${key}"`)
    }
  }
  for (const key of keys) {
    const source = (value as Record<string, unknown>)[key]
    if (typeof source !== "string") {
      throw new Error(`${prefix}: scripts.${key} must be a string`)
    }
    if (isExternalScriptSource(source)) {
      throw new Error(
        `${prefix}: scripts.${key} must be inline source; external script paths are not supported`,
      )
    }
  }
  if (Object.hasOwn(value, "pre")) {
    return {
      pre: (value as { pre: string }).pre,
      ...(Object.hasOwn(value, "post")
        ? { post: (value as { post: string }).post }
        : {}),
    }
  }
  return { post: (value as { post: string }).post }
}

export function parseTests(
  value: unknown,
  prefix = "lang.parseRequest",
): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "string")
    throw new Error(`${prefix}: tests must be a string`)
  if (isExternalScriptSource(value))
    throw new Error(
      `${prefix}: tests must be inline source; external test files are not supported`,
    )
  return value
}

export function serializeScriptFields(fields: ScriptFields): string {
  let out = ""
  const literal = (key: string, source: string, indent: number) => {
    const newline = source.endsWith("\n")
    out += `${" ".repeat(indent)}${key}: |2${newline ? "+" : "-"}\n`
    for (const line of (newline ? source.slice(0, -1) : source).split("\n"))
      out += `${" ".repeat(indent + 2)}${line}\n`
  }
  if (fields.scripts) {
    out += "scripts:\n"
    for (const phase of ["pre", "post"] as const) {
      const source = fields.scripts[phase]
      if (source !== undefined) literal(phase, source, 2)
    }
  }
  if (fields.tests !== undefined) literal("tests", fields.tests, 0)
  return out
}
