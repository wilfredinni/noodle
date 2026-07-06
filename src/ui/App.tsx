import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { join, resolve } from "node:path"
import { AppInner } from "./AppInner"
import { useConfig, upsertCollectionPath } from "../hooks/useConfig"
import { listEnvironmentsWithColors } from "../env/listWithColors"
import { ThemeProvider, THEMES, DEFAULT_THEME_INDEX } from "./theme"
import { stat } from "node:fs/promises"
import { Toast, showToast } from "./Toast"
import { loadSettings, saveSettings } from "../filestore"
import { loadLastRequest } from "./tabs/uiState"
import type { Keybinds } from "./keybind"

const CONFIG_DIR = `${process.env.HOME ?? "~"}/.config/noodle`

export function App({
  collectionDir,
  environmentsDir: _initialEnvironmentsDir,
  envList: initialEnvList,
  initialEnvName,
  settingsEnv: initialSettingsEnv,
  keybinds: keybinds,
  lastRequestId: initialLastRequestId,
}: {
  collectionDir: string
  environmentsDir: string
  envList: string[]
  initialEnvName?: string
  settingsEnv?: string
  keybinds: Keybinds
  lastRequestId?: string
}) {
  const { config, updateConfig } = useConfig(CONFIG_DIR)
  const switchingRef = useRef(false)
  const initialCollectionDir = useMemo(() => resolve(collectionDir), [collectionDir])
  const [activeCollectionDir, setActiveCollectionDir] = useState(
    initialCollectionDir,
  )
  const [settingsEnv, setSettingsEnv] = useState<string | undefined>(
    initialSettingsEnv,
  )
  const [lastRequestId, setLastRequestId] = useState<string | undefined>(
    initialLastRequestId,
  )
  const [initialEnvNameState, setInitialEnvNameState] = useState<
    string | undefined
  >(initialEnvName)

  const [activeIndex, setActiveIndex] = useState(() => {
    const idx = THEMES.findIndex((t) => t.name === config.theme)
    return idx !== -1 ? idx : DEFAULT_THEME_INDEX
  })
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)

  const [envNames, setEnvNames] = useState<string[]>(initialEnvList)
  const [envColors, setEnvColors] = useState<
    Record<string, string | undefined>
  >({})

  const activeEnvironmentsDir = useMemo(
    () => join(activeCollectionDir, ".environments"),
    [activeCollectionDir],
  )

  useEffect(() => {
    if (config.collections[0] === activeCollectionDir) return
    updateConfig((prev) => ({
      collections: upsertCollectionPath(prev.collections, activeCollectionDir),
    }))
  }, [activeCollectionDir, config.collections, updateConfig])

  useEffect(() => {
    let cancelled = false
    listEnvironmentsWithColors(activeEnvironmentsDir).then((items) => {
      if (cancelled) return
      const colors: Record<string, string | undefined> = {}
      for (const item of items) colors[item.name] = item.color
      setEnvColors(colors)
    })
    return () => {
      cancelled = true
    }
  }, [activeEnvironmentsDir])

  const handleThemeChange = useCallback(
    (index: number) => {
      setActiveIndex(index)
      updateConfig({ theme: THEMES[index]!.name })
    },
    [updateConfig],
  )

  const handleLayoutChange = useCallback(
    (layout: "stacked" | "side-by-side") => {
      updateConfig({ layout })
    },
    [updateConfig],
  )

  const handleEnvListChanged = useCallback(async () => {
    const items = await listEnvironmentsWithColors(activeEnvironmentsDir)
    setEnvNames(items.map((i) => i.name))
    const colors: Record<string, string | undefined> = {}
    for (const item of items) colors[item.name] = item.color
    setEnvColors(colors)
  }, [activeEnvironmentsDir])

  const handleEnvChange = useCallback(
    (name: string | null) => {
      const envName = name ?? undefined
      setSettingsEnv(envName)
      saveSettings(activeCollectionDir, { environment: envName }).catch(() => {})
    },
    [activeCollectionDir],
  )

  const handleCollectionChange = useCallback(
    async (nextDir: string) => {
      if (switchingRef.current) return
      const normalized = resolve(nextDir)
      if (normalized === activeCollectionDir) return

      switchingRef.current = true
      try {
        try {
          const s = await stat(normalized)
          if (!s.isDirectory()) {
            showToast(`Not a directory: ${normalized}`, "error")
            return
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          showToast(`Failed to open collection: ${msg}`, "error")
          return
        }

        let nextEnvNames: string[] = []
        const nextEnvColors: Record<string, string | undefined> = {}
        try {
          const items = await listEnvironmentsWithColors(
            join(normalized, ".environments"),
          )
          nextEnvNames = items.map((item) => item.name)
          for (const item of items) {
            nextEnvColors[item.name] = item.color
          }
        } catch {
          // Collection env metadata is optional.
        }

        let nextSettingsEnv: string | undefined
        try {
          nextSettingsEnv = (await loadSettings(normalized)).environment
        } catch {
          nextSettingsEnv = undefined
        }

        let nextLastRequestId: string | undefined
        try {
          nextLastRequestId = await loadLastRequest(normalized)
        } catch {
          nextLastRequestId = undefined
        }

        setEnvNames(nextEnvNames)
        setEnvColors(nextEnvColors)
        setSettingsEnv(nextSettingsEnv)
        setLastRequestId(nextLastRequestId)
        setInitialEnvNameState(undefined)
        setActiveCollectionDir(normalized)
        updateConfig((prev) => ({
          collections: upsertCollectionPath(prev.collections, normalized),
        }))
      } finally {
        switchingRef.current = false
      }
    },
    [activeCollectionDir, updateConfig],
  )

  const collectionPaths = useMemo(
    () => upsertCollectionPath(config.collections, activeCollectionDir),
    [config.collections, activeCollectionDir],
  )

  return (
    <ThemeProvider activeIndex={activeIndex} previewIndex={previewIndex}>
      <Toast />
      <AppInner
        key={activeCollectionDir}
        collectionDir={activeCollectionDir}
        environmentsDir={activeEnvironmentsDir}
        envNames={envNames}
        envColors={envColors}
        initialEnvName={initialEnvNameState}
        activeIndex={activeIndex}
        previewIndex={previewIndex}
        setPreviewIndex={setPreviewIndex}
        onThemeChange={handleThemeChange}
        keybinds={keybinds}
        initialLayout={config.layout}
        confirmUndoAll={config.confirm_undo_all}
        onLayoutChange={handleLayoutChange}
        onEnvChange={handleEnvChange}
        onEnvListChanged={handleEnvListChanged}
        settingsEnv={settingsEnv}
        initialLastRequestId={lastRequestId}
        collectionPaths={collectionPaths}
        onCollectionChange={handleCollectionChange}
      />
    </ThemeProvider>
  )
}
