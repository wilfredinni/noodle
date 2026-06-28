import { useState, useCallback, useRef, useEffect } from "react"
import { readFileSync, writeFileSync } from "node:fs"
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import * as yaml from "js-yaml"

export const CONFIG_FILE_NAME = "config.yml"

export interface NoodleConfig {
  theme: number
  layout: "stacked" | "side-by-side"
}

const DEFAULTS: NoodleConfig = {
  theme: 0,
  layout: "stacked",
}

export function loadConfig(configDir: string): NoodleConfig {
  try {
    const raw = readFileSync(join(configDir, CONFIG_FILE_NAME), "utf8")
    const data = yaml.load(raw)
    if (!data || typeof data !== "object") return { ...DEFAULTS }
    const obj = data as Record<string, unknown>
    return {
      theme: typeof obj.theme === "number" ? obj.theme : DEFAULTS.theme,
      layout: obj.layout === "side-by-side" ? "side-by-side" : DEFAULTS.layout,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveConfig(configDir: string, config: NoodleConfig): void {
  mkdirSync(configDir, { recursive: true })
  const data = {
    theme: config.theme,
    layout: config.layout,
  }
  writeFileSync(join(configDir, CONFIG_FILE_NAME), yaml.dump(data), "utf8")
}

const DEBOUNCE_MS = 300

export function useConfig(configDir: string): {
  config: NoodleConfig
  updateConfig: (partial: Partial<NoodleConfig>) => void
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
    (partial: Partial<NoodleConfig>) => {
      const next = { ...configRef.current, ...partial }
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
