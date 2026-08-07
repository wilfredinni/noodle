import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import * as yaml from "js-yaml"

export const CONFIG_FILE_NAME = "config.yml"
export interface NoodleConfig {
  theme: string
  layout: "stacked" | "side-by-side"
  confirm_undo_all: boolean
  collections: string[]
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
  return {
    ...config,
    collections: normalizeCollectionPaths(config.collections),
  }
}
export function loadConfig(configDir: string): NoodleConfig {
  try {
    const data = yaml.load(
      readFileSync(join(configDir, CONFIG_FILE_NAME), "utf8"),
    )
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
    })
  } catch {
    return { ...DEFAULT_CONFIG }
  }
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
