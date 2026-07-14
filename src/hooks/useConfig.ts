import { useState, useCallback, useRef, useEffect } from "react"
import {
  loadConfig,
  normalizeConfig,
  saveConfig,
  type NoodleConfig,
} from "../config"
export {
  CONFIG_FILE_NAME,
  loadConfig,
  normalizeCollectionPath,
  normalizeCollectionPaths,
  saveConfig,
  upsertCollectionPath,
  type NoodleConfig,
} from "../config"

const DEBOUNCE_MS = 300

export function useConfig(configDir: string): {
  config: NoodleConfig
  updateConfig: (
    partial:
      Partial<NoodleConfig> | ((prev: NoodleConfig) => Partial<NoodleConfig>),
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
        Partial<NoodleConfig> | ((prev: NoodleConfig) => Partial<NoodleConfig>),
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
