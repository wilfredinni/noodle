import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { Environment } from "../schema"

export async function loadEnvironment(
  dir: string,
  name: string,
): Promise<Environment> {
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    throw new Error("env.load: invalid environment name")
  }
  const filePath = join(dir, `${name}.env`)
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

  const vars: Record<string, string> = {}
  const lines = content.split("\n")

  for (const raw of lines) {
    const trimmed = raw.trim()
    if (trimmed === "" || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) {
      throw new Error(
        `env.load: invalid line (expected KEY=value): "${trimmed}"`,
      )
    }
    const key = trimmed.slice(0, eq).trimEnd()
    const value = trimmed.slice(eq + 1)
    if (key === "") {
      throw new Error("env.load: var name must not be empty")
    }
    vars[key] = value
  }

  return { name, vars }
}
