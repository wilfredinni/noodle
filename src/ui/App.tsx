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
import type { CollectionMode } from "../app/main"
import { classifyPath } from "../app/main"

const CONFIG_DIR = `${process.env.HOME ?? "~"}/.config/noodle`

export function App({
  collectionDir,
  envList: initialEnvList,
  initialEnvName,
  settingsEnv: initialSettingsEnv,
  keybinds: keybinds,
  lastRequestId: initialLastRequestId,
  shouldRegister = false,
  mode: initialMode = "empty",
}: {
  collectionDir: string
  envList: string[]
  initialEnvName?: string
  settingsEnv?: string
  keybinds: Keybinds
  lastRequestId?: string
  shouldRegister?: boolean
  mode?: CollectionMode
}) {
  const { config, updateConfig } = useConfig(CONFIG_DIR)
  const switchingRef = useRef(false)
  const initialCollectionDir = useMemo(
    () => resolve(collectionDir),
    [collectionDir],
  )
  const [activeCollectionDir, setActiveCollectionDir] =
    useState(initialCollectionDir)
  const [mode, setMode] = useState<CollectionMode>(initialMode)
  const [reloadKey, setReloadKey] = useState(0)
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
    if (shouldRegister && mode === "collection") {
      updateConfig((prev) => ({
        collections: upsertCollectionPath(
          prev.collections,
          activeCollectionDir,
        ),
      }))
    }
  }, [])

  useEffect(() => {
    if (mode !== "collection") return
    let cancelled = false
    listEnvironmentsWithColors(activeEnvironmentsDir).then((items) => {
      if (cancelled) return
      setEnvNames(items.map((item) => item.name))
      const colors: Record<string, string | undefined> = {}
      for (const item of items) colors[item.name] = item.color
      setEnvColors(colors)
    })
    return () => {
      cancelled = true
    }
  }, [activeEnvironmentsDir, mode])

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
    if (mode !== "collection") return
    const items = await listEnvironmentsWithColors(activeEnvironmentsDir)
    setEnvNames(items.map((i) => i.name))
    const colors: Record<string, string | undefined> = {}
    for (const item of items) colors[item.name] = item.color
    setEnvColors(colors)
  }, [activeEnvironmentsDir, mode])

  const handleEnvChange = useCallback(
    (name: string | null) => {
      const envName = name ?? undefined
      setSettingsEnv(envName)
      if (mode === "collection") {
        saveSettings(activeCollectionDir, { environment: envName }).catch(
          () => {},
        )
      }
    },
    [activeCollectionDir, mode],
  )

  const handleReloadCollection = useCallback(() => {
    setReloadKey((k) => k + 1)
  }, [])

  const handleCollectionBootstrapped = useCallback(
    (bootstrappedDir: string) => {
      const resolved = resolve(bootstrappedDir)
      setMode("collection")
      updateConfig((prev) => ({
        collections: upsertCollectionPath(prev.collections, resolved),
      }))
      listEnvironmentsWithColors(join(resolved, ".environments"))
        .then((items) => {
          setEnvNames(items.map((i) => i.name))
          const colors: Record<string, string | undefined> = {}
          for (const item of items) colors[item.name] = item.color
          setEnvColors(colors)
        })
        .catch(() => {})
    },
    [updateConfig],
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
            showToast("Not a directory", "error")
            return
          }
        } catch {
          showToast("Failed to open collection", "error")
          return
        }

        const nextMode = classifyPath(normalized)
        let nextEnvNames: string[] = []
        const nextEnvColors: Record<string, string | undefined> = {}

        if (nextMode === "collection") {
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
        }

        let nextSettingsEnv: string | undefined
        if (nextMode === "collection") {
          try {
            nextSettingsEnv = (await loadSettings(normalized)).environment
          } catch {
            nextSettingsEnv = undefined
          }
        }

        let nextLastRequestId: string | undefined
        if (nextMode === "collection") {
          try {
            nextLastRequestId = await loadLastRequest(normalized)
          } catch {
            nextLastRequestId = undefined
          }
        }

        setEnvNames(nextEnvNames)
        setEnvColors(nextEnvColors)
        setSettingsEnv(nextSettingsEnv)
        setLastRequestId(nextLastRequestId)
        setInitialEnvNameState(undefined)
        setActiveCollectionDir(normalized)
        setMode(nextMode)
        if (nextMode === "collection") {
          updateConfig((prev) => ({
            collections: upsertCollectionPath(prev.collections, normalized),
          }))
        }
      } finally {
        switchingRef.current = false
      }
    },
    [activeCollectionDir, updateConfig],
  )

  const collectionPaths = useMemo(
    () =>
      mode === "collection"
        ? upsertCollectionPath(config.collections, activeCollectionDir)
        : config.collections,
    [config.collections, activeCollectionDir, mode],
  )

  return (
    <ThemeProvider activeIndex={activeIndex} previewIndex={previewIndex}>
      <Toast />
      <AppInner
        key={`${activeCollectionDir}__${reloadKey}__${mode}`}
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
        onReloadCollection={handleReloadCollection}
        onCollectionBootstrapped={handleCollectionBootstrapped}
        mode={mode}
      />
    </ThemeProvider>
  )
}
