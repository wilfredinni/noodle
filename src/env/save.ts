import { link, mkdir, rename, unlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import type { Environment } from "../schema"
import { VALID_COLORS } from "./constants"
import { isValidVariableName } from "../variableReference"

export interface SaveEnvironmentOptions {
  mode?: "replace" | "create"
}

export function validateEnvironment(env: Environment): void {
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

  for (const [kind, keys] of [
    ["variable", Object.keys(env.vars)],
    ["disabled variable", Object.keys(env.disabledVars ?? {})],
    ["secret", Object.keys(env.secretVars ?? {})],
  ] as const) {
    for (const key of keys) {
      if (key === "_color" || !isValidVariableName(key)) {
        throw new Error(`env.save: invalid ${kind} key "${key}"`)
      }
    }
  }

  for (const value of [
    ...Object.values(env.vars),
    ...Object.values(env.disabledVars ?? {}),
  ]) {
    if (/[\r\n\0]/.test(value)) {
      throw new Error("env.save: values must not contain CR, LF, or NUL")
    }
  }
}

export async function saveEnvironment(
  dir: string,
  env: Environment,
  options: SaveEnvironmentOptions = {},
): Promise<void> {
  validateEnvironment(env)

  const lines: string[] = []

  if (env.color) {
    lines.push(`_color=${env.color}`)
  }

  const secretKeys = new Set(Object.keys(env.secretVars ?? {}))

  for (const [key, value] of Object.entries(env.vars)) {
    if (secretKeys.has(key)) continue
    lines.push(`${key}=${value}`)
  }

  const disabledVars = env.disabledVars ?? {}
  for (const [key, value] of Object.entries(disabledVars)) {
    if (secretKeys.has(key)) continue
    lines.push(`# ${key}=${value}`)
  }

  for (const [key, status] of Object.entries(env.secretVars ?? {})) {
    lines.push(`# @secret ${key}`)
    lines.push(status === "disabled" ? `# ${key}=` : `${key}=`)
  }

  lines.push("")

  await mkdir(dir, { recursive: true })

  const filePath = join(dir, `${env.name}.env`)
  const tmpPath = join(dir, `.${env.name}.${randomUUID()}.tmp`)
  await writeFile(tmpPath, lines.join("\n"), "utf8")
  try {
    if (options.mode === "create") {
      await link(tmpPath, filePath)
    } else {
      await rename(tmpPath, filePath)
    }
  } catch (e) {
    await unlink(tmpPath).catch(() => {})
    if ((e as NodeJS.ErrnoException).code === "EEXIST") {
      const error = new Error(
        `env.save: environment "${env.name}" already exists`,
        { cause: e },
      ) as NodeJS.ErrnoException
      error.code = "EEXIST"
      throw error
    }
    throw new Error(
      `env.save: ${options.mode === "create" ? "create" : "rename"} failed`,
      { cause: e },
    )
  }
  if (options.mode === "create") await unlink(tmpPath).catch(() => {})
}
