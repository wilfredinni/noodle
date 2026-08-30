import { writeFile, rename, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
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

  for (const value of [
    ...Object.values(env.vars),
    ...Object.values(env.disabledVars ?? {}),
  ]) {
    if (/[\r\n\0]/.test(value)) {
      throw new Error("env.save: values must not contain CR, LF, or NUL")
    }
  }

  if (env.color) {
    lines.push(`_color=${env.color}`)
  }

  const secretKeys = new Set(Object.keys(env.secretVars ?? {}))

  for (const [key, value] of Object.entries(env.vars)) {
    if (key === "") continue
    if (secretKeys.has(key)) continue
    lines.push(`${key}=${value}`)
  }

  const disabledVars = env.disabledVars ?? {}
  for (const [key, value] of Object.entries(disabledVars)) {
    if (key === "") continue
    if (secretKeys.has(key)) continue
    lines.push(`# ${key}=${value}`)
  }

  for (const [key, status] of Object.entries(env.secretVars ?? {})) {
    if (key === "_color" || !/^\w+$/.test(key)) {
      throw new Error(`env.save: invalid secret key "${key}"`)
    }
    lines.push(`# @secret ${key}`)
    lines.push(status === "disabled" ? `# ${key}=` : `${key}=`)
  }

  lines.push("")

  await mkdir(dir, { recursive: true })

  const filePath = join(dir, `${env.name}.env`)
  const tmpPath = join(dir, `.${env.name}.${randomUUID()}.tmp`)
  await writeFile(tmpPath, lines.join("\n"), "utf8")
  try {
    await rename(tmpPath, filePath)
  } catch (e) {
    // Best-effort cleanup — if rename fails, tmp file may persist but
    // original is left intact. Next save will succeed (tmp name is unique).
    throw new Error("env.save: rename failed", { cause: e })
  }
}
