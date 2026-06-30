import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import * as yaml from "js-yaml"
import type { FieldKind } from "../editMode"

export type ResponseTabKind = "body" | "headers" | "timeline"

export interface TabPrefs {
  requestTab: FieldKind
  responseTab: ResponseTabKind
}

function stateDir(colDir: string): string {
  return join(colDir, ".noodle")
}

function statePath(colDir: string): string {
  return join(colDir, ".noodle", "ui-state.yml")
}

const DEFAULTS: TabPrefs = { requestTab: "headers", responseTab: "body" }

export function isDefaultPrefs(prefs: TabPrefs): boolean {
  return prefs.requestTab === DEFAULTS.requestTab && prefs.responseTab === DEFAULTS.responseTab
}

export async function loadUIState(
  colDir: string,
): Promise<Map<string, TabPrefs>> {
  try {
    const raw = await readFile(statePath(colDir), "utf8")
    const data = yaml.load(raw)
    if (!data || typeof data !== "object") return new Map()
    const obj = data as Record<string, unknown>
    const map = new Map<string, TabPrefs>()
    for (const [key, val] of Object.entries(obj)) {
      if (val && typeof val === "object") {
        const v = val as Record<string, unknown>
        map.set(key, {
          requestTab: v.request as FieldKind,
          responseTab: v.response as ResponseTabKind,
        })
      }
    }
    return map
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return new Map()
    return new Map()
  }
}

export async function saveUIState(
  colDir: string,
  map: Map<string, TabPrefs>,
): Promise<void> {
  const dir = stateDir(colDir)
  await mkdir(dir, { recursive: true })

  const lastRequestId = await loadLastRequest(colDir)

  const obj: Record<string, unknown> = {}
  if (lastRequestId) obj.lastRequest = lastRequestId
  for (const [key, val] of map) {
    if (isDefaultPrefs(val)) continue
    obj[key] = { request: val.requestTab, response: val.responseTab }
  }
  const yamlText = yaml.dump(obj)
  await writeFile(statePath(colDir), yamlText, "utf8")
}

export async function loadLastRequest(
  colDir: string,
): Promise<string | undefined> {
  try {
    const raw = await readFile(statePath(colDir), "utf8")
    const data = yaml.load(raw)
    if (!data || typeof data !== "object") return undefined
    const obj = data as Record<string, unknown>
    if (typeof obj.lastRequest === "string") return obj.lastRequest
    return undefined
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined
    return undefined
  }
}

export async function saveLastRequest(
  colDir: string,
  requestId: string,
): Promise<void> {
  const dir = stateDir(colDir)
  await mkdir(dir, { recursive: true })

  let obj: Record<string, unknown> = {}
  try {
    const raw = await readFile(statePath(colDir), "utf8")
    const data = yaml.load(raw)
    if (data && typeof data === "object") {
      obj = data as Record<string, unknown>
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new Error(`Failed to read ui-state.yml`, { cause: e })
    }
  }

  obj.lastRequest = requestId
  const yamlText = yaml.dump(obj)
  await writeFile(statePath(colDir), yamlText, "utf8")
}
