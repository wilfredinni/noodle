import type { ScriptFields } from "../schema"

export function isExternalScriptSource(source: string): boolean {
  return source.startsWith("./") && source.endsWith(".js")
}

export function validateScriptSource(source: string): void {
  if (source.includes("\0"))
    throw new Error("script source must not contain NUL")
  if (isExternalScriptSource(source)) {
    if (
      source.includes("\\") ||
      /[\r\n]/.test(source) ||
      source
        .slice(2)
        .split("/")
        .some((part) => !part || part === "." || part === "..")
    )
      throw new Error(
        "invalid external script path: use ./ and forward-slash segments without traversal",
      )
    return
  }
  const literal = source.trim()
  if (
    /^[\w.@~\\/-]+\.(?:[cm]?js|ts)$/.test(literal) ||
    (/^(?:file:\/\/|\.{1,2}[\\/]|[~@][\\/]|[a-zA-Z]:[\\/]|\\|\/(?![/*]))[^\r\n;{}()'"`]+$/.test(
      literal,
    ) &&
      !/^\/.*\/[dgimsuvy]*$/.test(literal))
  )
    throw new Error("invalid external script path: expected ./path/to/file.js")
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
    validateScriptSource(source)
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
  validateScriptSource(value)
  return value
}

export function serializeScriptFields(fields: ScriptFields): string {
  let out = ""
  const literal = (key: string, source: string, indent: number) => {
    validateScriptSource(source)
    if (isExternalScriptSource(source)) {
      out += `${" ".repeat(indent)}${key}: ${JSON.stringify(source)}\n`
      return
    }
    const newline = source.endsWith("\n")
    out += `${" ".repeat(indent)}${key}: |2${newline ? "+" : "-"}\n`
    for (const line of (newline ? source.slice(0, -1) : source).split("\n"))
      out += `${" ".repeat(indent + 2)}${line}\n`
  }
  if (fields.scripts && (fields.scripts.pre || fields.scripts.post)) {
    out += "scripts:\n"
    for (const phase of ["pre", "post"] as const) {
      const source = fields.scripts[phase]
      if (source) literal(phase, source, 2)
    }
  }
  if (fields.tests) literal("tests", fields.tests, 0)
  return out
}
