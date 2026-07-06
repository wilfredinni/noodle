import { useState, useCallback, useRef, useEffect } from "react"
import { readFileSync, writeFileSync } from "node:fs"
import { mkdirSync } from "node:fs"
import { join, resolve } from "node:path"
import * as yaml from "js-yaml"
export const CONFIG_FILE_NAME = "config.yml"

export interface NoodleConfig {
  theme: string
  layout: "stacked" | "side-by-side"
  confirm_undo_all: boolean
  collections: string[]
}

const DEFAULTS: NoodleConfig = {
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
  const out: string[] = []
  for (const path of paths) {
    if (path.trim() === "") continue
    const normalized = normalizeCollectionPath(path)
    if (seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

export function upsertCollectionPath(paths: string[], path: string): string[] {
  if (path.trim() === "") return normalizeCollectionPaths(paths)
  const normalized = normalizeCollectionPath(path)
  return [normalized, ...paths.filter((item) => item !== normalized)]
}

function normalizeConfig(config: NoodleConfig): NoodleConfig {
  return {
    ...config,
    collections: normalizeCollectionPaths(config.collections),
  }
}

export function loadConfig(configDir: string): NoodleConfig {
  try {
    const raw = readFileSync(join(configDir, CONFIG_FILE_NAME), "utf8")
    const data = yaml.load(raw)
    if (!data || typeof data !== "object") return { ...DEFAULTS }
    const obj = data as Record<string, unknown>
    return normalizeConfig({
      theme: typeof obj.theme === "string" ? obj.theme : DEFAULTS.theme,
      layout: obj.layout === "side-by-side" ? "side-by-side" : DEFAULTS.layout,
      confirm_undo_all:
        typeof obj.confirm_undo_all === "boolean"
          ? obj.confirm_undo_all
          : DEFAULTS.confirm_undo_all,
      collections: Array.isArray(obj.collections)
        ? obj.collections.filter(
            (value): value is string => typeof value === "string",
          )
        : DEFAULTS.collections,
    })
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveConfig(configDir: string, config: NoodleConfig): void {
  mkdirSync(configDir, { recursive: true })
  const normalized = normalizeConfig(config)
  const data = {
    theme: normalized.theme,
    layout: normalized.layout,
    confirm_undo_all: normalized.confirm_undo_all,
    collections: normalized.collections,
  }
  writeFileSync(join(configDir, CONFIG_FILE_NAME), yaml.dump(data), "utf8")
}

const DEBOUNCE_MS = 300

export function useConfig(configDir: string): {
  config: NoodleConfig
  updateConfig: (
    partial:
      | Partial<NoodleConfig>
      | ((prev: NoodleConfig) => Partial<NoodleConfig>),
  ) => void
} {
  const [config, setConfig] = useState<NoodleConfig>(() =>
    loadConfig(configDir),
  )
  const timerRef = useRef<Timer | null>(null)
  const configRef = useRef(config)
  configRef.current = config

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  const updateConfig = useCallback(
    (
      partial:
        | Partial<NoodleConfig>
        | ((prev: NoodleConfig) => Partial<NoodleConfig>),
    ) => {
      const patch =
        typeof partial === "function" ? partial(configRef.current) : partial
      const next = normalizeConfig({ ...configRef.current, ...patch })
      configRef.current = next
      setConfig(next)
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        saveConfig(configDir, configRef.current)
      }, DEBOUNCE_MS)
    },
    [configDir],
  )

  return { config, updateConfig }
}
