import { readFile } from "node:fs/promises"
import { join } from "node:path"
import yaml from "js-yaml"
import type { Environment } from "../schema"

export async function loadEnvironment(
  dir: string,
  name: string,
): Promise<Environment> {
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    throw new Error("env.load: invalid environment name")
  }
  const filePath = join(dir, `${name}.yml`)
  let content: string
  try {
    content = await readFile(filePath, "utf8")
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`env.load: environment file not found: ${filePath}`, {
        cause: e,
      })
    }
    throw new Error(`env.load: ${msg}`, { cause: e })
  }

  let doc: unknown
  try {
    doc = yaml.load(content)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`env.load: YAML syntax: ${msg}`, { cause: e })
  }

  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    throw new Error("env.load: expected a YAML mapping at top level")
  }

  const raw = doc as Record<string, unknown>

  if (typeof raw.name !== "string" || raw.name === "") {
    throw new Error('env.load: "name" must be a non-empty string')
  }

  if (raw.vars === undefined || raw.vars === null) {
    throw new Error('env.load: missing "vars"')
  }
  if (typeof raw.vars !== "object" || Array.isArray(raw.vars)) {
    throw new Error('env.load: "vars" must be a mapping')
  }

  const knownKeys = new Set(["name", "vars"])
  for (const key of Object.keys(raw)) {
    if (!knownKeys.has(key)) {
      throw new Error(`env.load: unknown key "${key}"`)
    }
  }

  const vars: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw.vars as Record<string, unknown>)) {
    if (k === "") {
      throw new Error("env.load: var name must not be empty")
    }
    vars[k] = String(v)
  }

  return { name: raw.name, vars }
}
