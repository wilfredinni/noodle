import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import * as yaml from "js-yaml"
import type { AppProxySettings } from "../schema"
import { parseAppProxyStrict } from "../proxy"
import { isExternalEditorId, type ExternalEditorId } from "../externalEditor"

export const CONFIG_FILE_NAME = "config.yml"
export interface NoodleConfig {
  theme: string
  layout: "stacked" | "side-by-side"
  confirm_undo_all: boolean
  collections: string[]
  external_editor?: ExternalEditorId
  proxy?: AppProxySettings
}
export const DEFAULT_CONFIG: NoodleConfig = {
  theme: "catppuccin",
  layout: "stacked",
  confirm_undo_all: true,
  collections: [],
}
export function normalizeCollectionPath(path: string): string {
  return resolve(path)
}
export function normalizeCollectionPaths(paths: string[]): string[] {
  const seen = new Set<string>()
  return paths.reduce<string[]>((out, path) => {
    if (!path.trim()) return out
    const normalized = normalizeCollectionPath(path)
    if (!seen.has(normalized)) {
      seen.add(normalized)
      out.push(normalized)
    }
    return out
  }, [])
}
export function upsertCollectionPath(paths: string[], path: string): string[] {
  if (!path.trim()) return normalizeCollectionPaths(paths)
  const normalized = normalizeCollectionPath(path)
  return [
    normalized,
    ...normalizeCollectionPaths(paths).filter((item) => item !== normalized),
  ]
}
export function appendCollectionPath(paths: string[], path: string): string[] {
  if (!path.trim()) return normalizeCollectionPaths(paths)
  return normalizeCollectionPaths([...paths, path])
}
export function normalizeConfig(config: NoodleConfig): NoodleConfig {
  const normalized: NoodleConfig = {
    ...config,
    collections: normalizeCollectionPaths(config.collections),
  }
  if (config.proxy !== undefined) {
    normalized.proxy = parseAppProxyStrict(config.proxy)
  }
  return normalized
}
export function loadConfig(configDir: string): NoodleConfig {
  let data: unknown
  try {
    data = yaml.load(readFileSync(join(configDir, CONFIG_FILE_NAME), "utf8"))
  } catch {
    return { ...DEFAULT_CONFIG }
  }
  if (!data || typeof data !== "object") return { ...DEFAULT_CONFIG }
  const obj = data as Record<string, unknown>
  return normalizeConfig({
    theme: typeof obj.theme === "string" ? obj.theme : DEFAULT_CONFIG.theme,
    layout:
      obj.layout === "side-by-side" ? "side-by-side" : DEFAULT_CONFIG.layout,
    confirm_undo_all:
      typeof obj.confirm_undo_all === "boolean"
        ? obj.confirm_undo_all
        : DEFAULT_CONFIG.confirm_undo_all,
    collections: Array.isArray(obj.collections)
      ? obj.collections.filter((v): v is string => typeof v === "string")
      : [],
    ...(isExternalEditorId(obj.external_editor)
      ? { external_editor: obj.external_editor }
      : {}),
    proxy: obj.proxy === undefined ? undefined : parseAppProxyStrict(obj.proxy),
  })
}
export function saveConfig(configDir: string, config: NoodleConfig): void {
  mkdirSync(configDir, { recursive: true })
  const normalized = normalizeConfig(config)
  writeFileSync(
    join(configDir, CONFIG_FILE_NAME),
    yaml.dump(normalized),
    "utf8",
  )
}
