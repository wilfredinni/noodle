import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { Environment } from "../schema"
import { VALID_COLORS } from "./constants"

export async function saveEnvironment(
  dir: string,
  env: Environment,
): Promise<void> {
  if (
    !env.name ||
    env.name.includes("..") ||
    env.name.includes("/") ||
    env.name.includes("\\")
  ) {
    throw new Error("env.save: invalid environment name")
  }

  if (env.color !== undefined && !VALID_COLORS.has(env.color)) {
    throw new Error(
      `env.save: unknown color "${env.color}", expected one of ${[...VALID_COLORS].join("|")}`,
    )
  }

  const lines: string[] = []

  if (env.color) {
    lines.push(`_color=${env.color}`)
  }

  for (const [key, value] of Object.entries(env.vars)) {
    if (key === "") continue
    lines.push(`${key}=${value}`)
  }

  const disabledVars = env.disabledVars ?? {}
  for (const [key, value] of Object.entries(disabledVars)) {
    if (key === "") continue
    lines.push(`# ${key}=${value}`)
  }

  lines.push("")

  const filePath = join(dir, `${env.name}.env`)
  await writeFile(filePath, lines.join("\n"), "utf8")
}
