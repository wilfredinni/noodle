import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import type { Environment } from "../schema"
import { VALID_COLORS } from "./constants"
import { resolveStoredSecret } from "../secrets"

export interface LoadEnvironmentOptions {
  resolveSecrets?: boolean
}

function setOwn<T>(record: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  })
}

export async function loadEnvironment(
  dir: string,
  name: string,
  options: LoadEnvironmentOptions = {},
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
  const disabledVars: Record<string, string> = {}
  const secretVars: NonNullable<Environment["secretVars"]> = {}
  const declarations = new Map<string, boolean>()
  let color: string | undefined
  const lines = content.split("\n")
  let pendingSecret: string | undefined

  for (const raw of lines) {
    const trimmed = raw.trim()
    if (trimmed === "") {
      if (pendingSecret) {
        throw new Error(
          `env.load: dangling secret marker for "${pendingSecret}"`,
        )
      }
      continue
    }
    if (/^# @secret(?:\s|$)/.test(trimmed)) {
      if (pendingSecret) {
        throw new Error(
          `env.load: dangling secret marker for "${pendingSecret}"`,
        )
      }
      const marker = trimmed.match(/^# @secret\s+(\w+)$/)
      const key = marker?.[1]
      if (!key) {
        throw new Error(`env.load: invalid secret marker "${trimmed}"`)
      }
      if (declarations.has(key)) {
        throw new Error(`env.load: duplicate secret marker for "${key}"`)
      }
      if (Object.hasOwn(vars, key) || Object.hasOwn(disabledVars, key)) {
        throw new Error(`env.load: secret "${key}" is declared more than once`)
      }
      pendingSecret = key
      continue
    }
    if (trimmed.startsWith("#")) {
      const afterHash = trimmed.slice(1).trimStart()
      const eq = afterHash.indexOf("=")
      if (eq === -1) {
        if (pendingSecret) {
          throw new Error(
            `env.load: secret marker for "${pendingSecret}" must be followed by a blank placeholder`,
          )
        }
        continue
      }
      const key = afterHash.slice(0, eq).trimEnd()
      if (key === "") continue
      if (key === "_color") continue
      const value = afterHash.slice(eq + 1)
      if (pendingSecret) {
        if (key !== pendingSecret) {
          throw new Error(
            `env.load: secret marker for "${pendingSecret}" does not match "${key}"`,
          )
        }
        if (value !== "") {
          throw new Error(`env.load: secret "${key}" must have a blank value`)
        }
        declarations.set(key, false)
        setOwn(secretVars, key, "disabled")
        setOwn(disabledVars, key, "")
        pendingSecret = undefined
      } else {
        if (declarations.has(key)) {
          throw new Error(
            `env.load: secret "${key}" is declared more than once`,
          )
        }
        setOwn(disabledVars, key, value)
      }
      continue
    }
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
    if (key === "_color") {
      if (pendingSecret) {
        throw new Error(
          `env.load: secret marker for "${pendingSecret}" does not match "_color"`,
        )
      }
      if (!VALID_COLORS.has(value)) {
        throw new Error(
          `env.load: unknown _color "${value}", expected one of ${[...VALID_COLORS].join("|")}`,
        )
      }
      color = value
      continue
    }
    if (pendingSecret) {
      if (key !== pendingSecret) {
        throw new Error(
          `env.load: secret marker for "${pendingSecret}" does not match "${key}"`,
        )
      }
      if (value !== "") {
        throw new Error(`env.load: secret "${key}" must have a blank value`)
      }
      declarations.set(key, true)
      pendingSecret = undefined
    } else {
      if (declarations.has(key)) {
        throw new Error(`env.load: secret "${key}" is declared more than once`)
      }
      setOwn(vars, key, value)
    }
  }

  if (pendingSecret) {
    throw new Error(`env.load: dangling secret marker for "${pendingSecret}"`)
  }

  for (const [key, enabled] of declarations) {
    if (!enabled) continue
    if (options.resolveSecrets === false) {
      setOwn(secretVars, key, "missing")
      continue
    }
    const resolved = await resolveStoredSecret(dirname(dir), name, key)
    setOwn(secretVars, key, resolved.status)
    if (resolved.value !== undefined) setOwn(vars, key, resolved.value)
  }

  return {
    name,
    vars,
    color,
    disabledVars:
      Object.keys(disabledVars).length > 0 ? disabledVars : undefined,
    secretVars: Object.keys(secretVars).length > 0 ? secretVars : undefined,
  }
}
