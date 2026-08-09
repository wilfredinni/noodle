import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { join, resolve } from "node:path"
import { AppInner } from "./AppInner"
import { appendCollectionPath, useConfig } from "../hooks/useConfig"
import { listEnvironmentsWithColors } from "../env/listWithColors"
import { ThemeProvider, THEMES, DEFAULT_THEME_INDEX } from "./theme"
import { stat } from "node:fs/promises"
import { Toast, showToast } from "./Toast"
import {
  DEFAULT_TIMELINE_MAX_ENTRIES,
  loadSettings,
  pruneTimeline,
  saveSettings,
} from "../filestore"
import { loadLastRequest } from "./tabs/uiState"
import type { Keybinds } from "./keybind"
import type { KeybindName } from "./keybind"
import { saveKeybinds } from "./keybindConfig"
import { classifyPath, type CollectionMode } from "../collectionPath"
import type {
  AppProxySettings,
  CollectionProxySettings,
  CollectionSettings,
} from "../schema"
import type { SystemProxySettings } from "../proxy"
import { resolveCollectionRegistration } from "./settings/collectionRegistry"
import { queueCollectionSettingsSave } from "./settings/settingsPersistence"
import type {
  CollectionSettingsCategory,
  GlobalSettingsCategory,
  SettingsScope,
} from "./settings/SettingsView"

const CONFIG_DIR = `${process.env.HOME ?? "~"}/.config/noodle`

export function App({
  collectionDir,
  envList: initialEnvList,
  initialEnvName,
  initialSettings = {},
  noProxy = false,
  systemProxy,
  keybinds: keybinds,
  lastRequestId: initialLastRequestId,
  shouldRegister = false,
  mode: initialMode = "empty",
}: {
  collectionDir: string
  envList: string[]
  initialEnvName?: string
  initialSettings?: CollectionSettings
  noProxy?: boolean
  systemProxy: SystemProxySettings
  keybinds: Keybinds
  lastRequestId?: string
  shouldRegister?: boolean
  mode?: CollectionMode
}) {
  const { config, updateConfig } = useConfig(CONFIG_DIR)
  const collectionPaths = config.collections
  const [liveKeybinds, setLiveKeybinds] = useState(keybinds)
  const switchingRef = useRef(false)
  const initialCollectionDir = useMemo(
    () => resolve(collectionDir),
    [collectionDir],
  )
  const [activeCollectionDir, setActiveCollectionDir] =
    useState(initialCollectionDir)
  const [mode, setMode] = useState<CollectionMode>(initialMode)
  const [reloadKey, setReloadKey] = useState(0)
  const [settings, setSettings] = useState<CollectionSettings>(initialSettings)
  const [registeredCollectionSettings, setRegisteredCollectionSettings] =
    useState<Record<string, CollectionSettings>>({})
  const settingsRef = useRef(initialSettings)
  const persistedSettingsRef = useRef(initialSettings)
  const activeCollectionDirRef = useRef(initialCollectionDir)
  const settingsSaveChainRef = useRef<Promise<void>>(Promise.resolve())
  const settingsPersistence = useMemo(
    () => ({
      activeCollectionDir: activeCollectionDirRef,
      currentSettings: settingsRef,
      persistedSettings: persistedSettingsRef,
      saveChain: settingsSaveChainRef,
    }),
    [],
  )
  const settingsEnv = settings.environment
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
  const [settingsScope, setSettingsScope] = useState<SettingsScope>("global")
  const [globalSettingsCategory, setGlobalSettingsCategory] =
    useState<GlobalSettingsCategory>("appearance")
  const [collectionSettingsCategory, setCollectionSettingsCategory] =
    useState<CollectionSettingsCategory>("general")

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
        collections: appendCollectionPath(
          prev.collections,
          activeCollectionDir,
        ),
      }))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all(
      collectionPaths.map(async (path) => {
        try {
          return [path, await loadSettings(path)] as const
        } catch {
          return [path, {}] as const
        }
      }),
    ).then((entries) => {
      if (!cancelled)
        setRegisteredCollectionSettings(Object.fromEntries(entries))
    })
    return () => {
      cancelled = true
    }
  }, [collectionPaths])

  useEffect(() => {
    if (mode !== "collection") return
    const limit = persistedSettingsRef.current.timelineMaxEntries
    if (limit === undefined) return
    pruneTimeline(activeCollectionDir, limit).catch(() =>
      showToast(
        "Timeline limit loaded, but existing history could not be pruned",
        "error",
      ),
    )
  }, [activeCollectionDir, mode])

  const updateGlobalConfig = useCallback(
    (patch: Parameters<typeof updateConfig>[0], errorMessage: string) => {
      try {
        updateConfig(patch, { immediate: true })
        return true
      } catch {
        showToast(errorMessage, "error")
        return false
      }
    },
    [updateConfig],
  )

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
      if (
        updateGlobalConfig(
          { theme: THEMES[index]!.name },
          "Failed to save theme",
        )
      ) {
        setActiveIndex(index)
      }
    },
    [updateGlobalConfig],
  )

  const handleLayoutChange = useCallback(
    (layout: "stacked" | "side-by-side") =>
      updateGlobalConfig({ layout }, "Failed to save layout"),
    [updateGlobalConfig],
  )

  const handleConfirmUndoAllChange = useCallback(
    (value: boolean) => {
      updateGlobalConfig(
        { confirm_undo_all: value },
        "Failed to save behavior settings",
      )
    },
    [updateGlobalConfig],
  )

  const handleAppProxyChange = useCallback(
    (proxy: AppProxySettings) =>
      updateGlobalConfig({ proxy }, "Failed to save proxy settings"),
    [updateGlobalConfig],
  )

  const handleKeybindChange = useCallback(
    (name: KeybindName, key: string) => {
      const next = { ...liveKeybinds, [name]: key }
      try {
        saveKeybinds(CONFIG_DIR, next)
        setLiveKeybinds(next)
        return true
      } catch {
        showToast("Failed to save keyboard shortcut", "error")
        return false
      }
    },
    [liveKeybinds],
  )

  const handleCollectionsChange = useCallback(
    (collections: string[]) =>
      updateGlobalConfig(
        { collections },
        "Failed to save registered collections",
      ),
    [updateGlobalConfig],
  )

  const handleRegisterCollection = useCallback(
    (rawPath: string): string | null => {
      const result = resolveCollectionRegistration(rawPath, config.collections)
      if (!result.ok) return result.error
      return handleCollectionsChange([...config.collections, result.path])
        ? null
        : "Could not save the collection path"
    },
    [config.collections, handleCollectionsChange],
  )

  const handleCollectionProxyChange = useCallback(
    (proxy: CollectionProxySettings) => {
      if (mode !== "collection") return false
      const nextSettings = { ...settingsRef.current, proxy }
      settingsRef.current = nextSettings
      setSettings(nextSettings)
      queueCollectionSettingsSave(
        settingsPersistence,
        activeCollectionDir,
        nextSettings,
        saveSettings,
        setSettings,
        () => showToast("Failed to save proxy settings", "error"),
      )
      return true
    },
    [activeCollectionDir, mode, settingsPersistence],
  )

  const handleCollectionSettingsChange = useCallback(
    (
      patch: Pick<
        CollectionSettings,
        "name" | "description" | "timelineMaxEntries"
      >,
    ) => {
      if (mode !== "collection") return false
      const previous = settingsRef.current
      const nextSettings = { ...previous, ...patch }
      const previousLimit =
        previous.timelineMaxEntries ?? DEFAULT_TIMELINE_MAX_ENTRIES
      const nextLimit =
        nextSettings.timelineMaxEntries ?? DEFAULT_TIMELINE_MAX_ENTRIES
      settingsRef.current = nextSettings
      setSettings(nextSettings)
      queueCollectionSettingsSave(
        settingsPersistence,
        activeCollectionDir,
        nextSettings,
        saveSettings,
        setSettings,
        () => showToast("Failed to save collection settings", "error"),
        nextLimit < previousLimit
          ? () => {
              pruneTimeline(activeCollectionDir, nextLimit).catch(() =>
                showToast(
                  "Timeline limit saved, but existing history could not be pruned",
                  "error",
                ),
              )
            }
          : undefined,
      )
      return true
    },
    [activeCollectionDir, mode, settingsPersistence],
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
      const nextSettings = { ...settingsRef.current, environment: envName }
      settingsRef.current = nextSettings
      setSettings(nextSettings)
      if (mode === "collection") {
        queueCollectionSettingsSave(
          settingsPersistence,
          activeCollectionDir,
          nextSettings,
          saveSettings,
          setSettings,
          () => showToast("Failed to save active environment", "error"),
        )
      }
    },
    [activeCollectionDir, mode, settingsPersistence],
  )

  const handleReloadCollection = useCallback(() => {
    setReloadKey((k) => k + 1)
  }, [])

  const handleCollectionBootstrapped = useCallback(
    (bootstrappedDir: string) => {
      const resolved = resolve(bootstrappedDir)
      setMode("collection")
      settingsRef.current = {}
      persistedSettingsRef.current = {}
      setSettings({})
      updateConfig((prev) => ({
        collections: appendCollectionPath(prev.collections, resolved),
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

  const handleCollectionImported = useCallback(
    (importedDir: string) => {
      const resolved = resolve(importedDir)
      updateConfig(
        (prev) => ({
          collections: appendCollectionPath(prev.collections, resolved),
        }),
        { immediate: true },
      )
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

        let nextSettings: CollectionSettings = {}
        if (nextMode === "collection") {
          try {
            nextSettings = await loadSettings(normalized)
          } catch {
            nextSettings = {}
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
        settingsRef.current = nextSettings
        persistedSettingsRef.current = nextSettings
        setSettings(nextSettings)
        setLastRequestId(nextLastRequestId)
        setInitialEnvNameState(undefined)
        setActiveCollectionDir(normalized)
        activeCollectionDirRef.current = normalized
        setMode(nextMode)
        if (nextMode === "collection") {
          updateConfig((prev) => ({
            collections: appendCollectionPath(prev.collections, normalized),
          }))
        }
      } finally {
        switchingRef.current = false
      }
    },
    [activeCollectionDir, updateConfig],
  )

  const collectionSettingsByPath = useMemo(
    () => ({
      ...registeredCollectionSettings,
      [activeCollectionDir]: settings,
    }),
    [activeCollectionDir, registeredCollectionSettings, settings],
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
        keybinds={liveKeybinds}
        onKeybindChange={handleKeybindChange}
        settingsScope={settingsScope}
        globalSettingsCategory={globalSettingsCategory}
        collectionSettingsCategory={collectionSettingsCategory}
        onSettingsScopeChange={setSettingsScope}
        onGlobalSettingsCategoryChange={setGlobalSettingsCategory}
        onCollectionSettingsCategoryChange={setCollectionSettingsCategory}
        initialLayout={config.layout}
        confirmUndoAll={config.confirm_undo_all}
        onConfirmUndoAllChange={handleConfirmUndoAllChange}
        onLayoutChange={handleLayoutChange}
        onEnvChange={handleEnvChange}
        onEnvListChanged={handleEnvListChanged}
        settingsEnv={settingsEnv}
        appProxy={config.proxy}
        collectionProxy={settings.proxy}
        collectionName={settings.name}
        collectionDescription={settings.description}
        timelineMaxEntries={settings.timelineMaxEntries}
        noProxy={noProxy}
        systemProxy={systemProxy}
        onAppProxyChange={handleAppProxyChange}
        onCollectionProxyChange={handleCollectionProxyChange}
        onCollectionSettingsChange={handleCollectionSettingsChange}
        initialLastRequestId={lastRequestId}
        collectionPaths={collectionPaths}
        collectionSettingsByPath={collectionSettingsByPath}
        activeCollectionDir={activeCollectionDir}
        onCollectionsChange={handleCollectionsChange}
        onRegisterCollection={handleRegisterCollection}
        onCollectionChange={handleCollectionChange}
        onReloadCollection={handleReloadCollection}
        onCollectionBootstrapped={handleCollectionBootstrapped}
        onCollectionImported={handleCollectionImported}
        mode={mode}
      />
    </ThemeProvider>
  )
}
