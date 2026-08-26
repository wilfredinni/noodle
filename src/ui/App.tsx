import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { randomUUID } from "node:crypto"
import { join, resolve } from "node:path"
import { AppInner } from "./AppInner"
import {
  appendCollectionPath,
  upsertCollectionPath,
  useConfig,
} from "../hooks/useConfig"
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
  ClientCertificateProfile,
  CollectionProxySettings,
  CollectionSettings,
  CollectionTlsSettings,
  ProxyCredentials,
} from "../schema"
import type { SystemProxySettings } from "../proxy"
import { resolveCollectionRegistration } from "./settings/collectionRegistry"
import {
  queueCollectionSettingsSave,
  type CollectionSettingsUpdate,
} from "./settings/settingsPersistence"
import type {
  CollectionSettingsCategory,
  GlobalSettingsCategory,
  SettingsScope,
} from "./settings/SettingsView"
import {
  applySettingsSecretTransaction,
  deleteAppSettingSecret,
  deleteCollectionSettingSecret,
  getAppSettingSecret,
  getCollectionSettingSecret,
  ensureCollectionId,
  loadCollectionProxyCredentials,
  loadTlsPassphrases,
  setAppSettingSecret,
  setCollectionSettingSecret,
  type SecretMutation,
} from "../secrets"
import {
  detectExternalEditors,
  resolveExternalEditor,
  type ExternalEditorId,
} from "../externalEditor"

const CONFIG_DIR = `${process.env.HOME ?? "~"}/.config/noodle`

function sameCertificateProfile(
  left: ClientCertificateProfile,
  right: ClientCertificateProfile,
): boolean {
  return (
    left.host === right.host &&
    left.port === right.port &&
    left.certFile === right.certFile &&
    left.keyFile === right.keyFile &&
    left.secretId === right.secretId &&
    left.enabled === right.enabled
  )
}

function certificateProfileIndex(
  profiles: ClientCertificateProfile[],
  target: ClientCertificateProfile,
  preferredIndex?: number,
): number {
  if (target.secretId) {
    const index = profiles.findIndex(
      (profile) => profile.secretId === target.secretId,
    )
    if (index !== -1) return index
  }
  if (
    preferredIndex !== undefined &&
    profiles[preferredIndex] &&
    sameCertificateProfile(profiles[preferredIndex], target)
  ) {
    return preferredIndex
  }
  const index = profiles.findIndex((profile) =>
    sameCertificateProfile(profile, target),
  )
  return index
}

function rebaseTlsSettings(
  current: CollectionTlsSettings | undefined,
  previous: CollectionTlsSettings | undefined,
  next: CollectionTlsSettings | undefined,
): CollectionTlsSettings | undefined {
  if (!next) return undefined
  const result = { ...current }
  if (previous?.verify !== next.verify) result.verify = next.verify
  if (previous?.caBundle !== next.caBundle) result.caBundle = next.caBundle

  const previousProfiles = previous?.clientCertificates ?? []
  const nextProfiles = next.clientCertificates ?? []
  const currentProfiles = [...(current?.clientCertificates ?? [])]
  if (nextProfiles.length === previousProfiles.length) {
    for (const [index, profile] of nextProfiles.entries()) {
      const previousProfile = previousProfiles[index]
      if (!previousProfile || sameCertificateProfile(previousProfile, profile))
        continue
      const currentIndex = certificateProfileIndex(
        currentProfiles,
        previousProfile,
        index,
      )
      if (currentIndex === -1) continue
      currentProfiles[currentIndex] = {
        ...profile,
        secretId: currentProfiles[currentIndex]?.secretId,
      }
    }
    result.clientCertificates = currentProfiles
  } else if (nextProfiles.length > previousProfiles.length) {
    result.clientCertificates = [
      ...currentProfiles,
      ...nextProfiles.slice(previousProfiles.length),
    ]
  }
  return result
}

export function App({
  collectionDir,
  envList: initialEnvList,
  initialEnvName,
  initialSettings = {},
  initialAppProxyCredentials = {},
  initialCollectionProxyCredentials = {},
  initialTlsPassphrases = {},
  initialSettingsSecretError,
  noProxy = false,
  insecure = false,
  systemProxy,
  keybinds,
  lastRequestId: initialLastRequestId,
  shouldRegister = false,
  mode: initialMode = "empty",
}: {
  collectionDir: string
  envList: string[]
  initialEnvName?: string
  initialSettings?: CollectionSettings
  initialAppProxyCredentials?: ProxyCredentials
  initialCollectionProxyCredentials?: ProxyCredentials
  initialTlsPassphrases?: Record<string, string>
  initialSettingsSecretError?: string
  noProxy?: boolean
  insecure?: boolean
  systemProxy: SystemProxySettings
  keybinds: Keybinds
  lastRequestId?: string
  shouldRegister?: boolean
  mode?: CollectionMode
}) {
  const { config, updateConfig } = useConfig(CONFIG_DIR)
  const externalEditors = useMemo(() => detectExternalEditors(), [])
  const externalEditor = resolveExternalEditor(
    config.external_editor,
    externalEditors,
  )
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
  const [appProxyCredentials, setAppProxyCredentials] = useState(
    initialAppProxyCredentials,
  )
  const [collectionProxyCredentials, setCollectionProxyCredentials] = useState(
    initialCollectionProxyCredentials,
  )
  const [tlsPassphrases, setTlsPassphrases] = useState(initialTlsPassphrases)
  const [registeredCollectionSettings, setRegisteredCollectionSettings] =
    useState<Record<string, CollectionSettings>>({})
  const settingsRef = useRef(initialSettings)
  const persistedSettingsRef = useRef(initialSettings)
  const activeCollectionDirRef = useRef(initialCollectionDir)
  const settingsSaveChainRef = useRef<Promise<void>>(Promise.resolve())
  const pendingSettingsUpdatesRef = useRef<CollectionSettingsUpdate[]>([])
  const settingsPersistence = useMemo(
    () => ({
      activeCollectionDir: activeCollectionDirRef,
      currentSettings: settingsRef,
      persistedSettings: persistedSettingsRef,
      saveChain: settingsSaveChainRef,
      pendingUpdates: pendingSettingsUpdatesRef,
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

  useEffect(() => {
    if (initialSettingsSecretError) {
      showToast(
        `Failed to load settings secrets: ${initialSettingsSecretError}`,
        "error",
      )
    }
  }, [initialSettingsSecretError])

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

  const handleExternalEditorChange = useCallback(
    (externalEditor: ExternalEditorId) => {
      updateGlobalConfig(
        { external_editor: externalEditor },
        "Failed to save external editor",
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
      void queueCollectionSettingsSave(
        settingsPersistence,
        activeCollectionDir,
        (settings) => ({
          ...settings,
          proxy:
            proxy.mode === "custom"
              ? {
                  ...proxy,
                  ...(settings.proxy?.mode === "custom" && settings.proxy.auth
                    ? { auth: true }
                    : {}),
                }
              : proxy,
        }),
        saveSettings,
        setSettings,
        () => showToast("Failed to save proxy settings", "error"),
      )
      return true
    },
    [activeCollectionDir, mode, settingsPersistence],
  )

  const persistCollectionSettingsTransaction = useCallback(
    (
      dir: string,
      update: CollectionSettingsUpdate,
      mutations: SecretMutation[],
    ) =>
      queueCollectionSettingsSave(
        settingsPersistence,
        dir,
        update,
        async (collectionDir, nextSettings) => {
          const collectionId =
            nextSettings.collectionId ??
            (await ensureCollectionId(collectionDir))
          if (!nextSettings.collectionId) {
            persistedSettingsRef.current = {
              ...persistedSettingsRef.current,
              collectionId,
            }
          }
          const persisted = { ...nextSettings, collectionId }
          await applySettingsSecretTransaction(mutations, () =>
            saveSettings(collectionDir, persisted),
          )
          return persisted
        },
        setSettings,
        () => {},
        (persisted) => {
          setRegisteredCollectionSettings((current) => ({
            ...current,
            [dir]: persisted,
          }))
        },
      ),
    [settingsPersistence],
  )

  const handleAppProxyCredentialsChange = useCallback(
    async (credentials: ProxyCredentials) => {
      if (config.proxy?.mode !== "custom" || !credentials.username) return false
      try {
        const proxy: AppProxySettings = {
          ...config.proxy,
          auth: true,
        }
        await applySettingsSecretTransaction(
          [
            {
              get: () => getAppSettingSecret("proxy:username"),
              set: (value) => setAppSettingSecret("proxy:username", value),
              delete: () => deleteAppSettingSecret("proxy:username"),
              value: credentials.username,
            },
            {
              get: () => getAppSettingSecret("proxy:password"),
              set: (value) => setAppSettingSecret("proxy:password", value),
              delete: () => deleteAppSettingSecret("proxy:password"),
              value: credentials.password,
            },
          ],
          () => {
            if (
              !updateGlobalConfig({ proxy }, "Failed to save proxy settings")
            ) {
              throw new Error("failed to persist proxy settings")
            }
          },
        )
        setAppProxyCredentials(credentials)
        return true
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : String(error),
          "error",
        )
        return false
      }
    },
    [config.proxy, updateGlobalConfig],
  )

  const handleCollectionProxyCredentialsChange = useCallback(
    async (credentials: ProxyCredentials) => {
      const current = settingsRef.current.proxy
      if (
        mode !== "collection" ||
        current?.mode !== "custom" ||
        !credentials.username
      )
        return false
      const dir = activeCollectionDirRef.current
      try {
        await persistCollectionSettingsTransaction(
          dir,
          (settings) => ({
            ...settings,
            proxy:
              settings.proxy?.mode === "custom"
                ? { ...settings.proxy, auth: true }
                : settings.proxy,
          }),
          [
            {
              get: () => getCollectionSettingSecret(dir, "proxy:username"),
              set: (value) =>
                setCollectionSettingSecret(dir, "proxy:username", value),
              delete: () =>
                deleteCollectionSettingSecret(dir, "proxy:username"),
              value: credentials.username,
            },
            {
              get: () => getCollectionSettingSecret(dir, "proxy:password"),
              set: (value) =>
                setCollectionSettingSecret(dir, "proxy:password", value),
              delete: () =>
                deleteCollectionSettingSecret(dir, "proxy:password"),
              value: credentials.password,
            },
          ],
        )
        setCollectionProxyCredentials(credentials)
        return true
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : String(error),
          "error",
        )
        return false
      }
    },
    [mode, persistCollectionSettingsTransaction],
  )

  const handleProxyAuthDisable = useCallback(
    async (scope: "app" | "collection") => {
      const current = scope === "app" ? config.proxy : settingsRef.current.proxy
      if (current?.mode !== "custom") return false
      const proxy = {
        ...current,
        auth: undefined,
      }
      const dir = activeCollectionDirRef.current
      try {
        const names = ["proxy:username", "proxy:password"] as const
        const mutations = names.map((name) => ({
          get: () =>
            scope === "app"
              ? getAppSettingSecret(name)
              : getCollectionSettingSecret(dir, name),
          set: (value: string) =>
            scope === "app"
              ? setAppSettingSecret(name, value)
              : setCollectionSettingSecret(dir, name, value),
          delete: () =>
            scope === "app"
              ? deleteAppSettingSecret(name)
              : deleteCollectionSettingSecret(dir, name),
        }))
        if (scope === "app") {
          await applySettingsSecretTransaction(mutations, () => {
            if (
              !updateGlobalConfig(
                { proxy: proxy as AppProxySettings },
                "Failed to save proxy settings",
              )
            ) {
              throw new Error("failed to persist proxy settings")
            }
          })
        } else {
          await persistCollectionSettingsTransaction(
            dir,
            (settings) => ({
              ...settings,
              proxy:
                settings.proxy?.mode === "custom"
                  ? { ...settings.proxy, auth: undefined }
                  : settings.proxy,
            }),
            mutations,
          )
        }
        if (scope === "app") setAppProxyCredentials({})
        else setCollectionProxyCredentials({})
        return true
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : String(error),
          "error",
        )
        return false
      }
    },
    [config.proxy, persistCollectionSettingsTransaction, updateGlobalConfig],
  )

  const handleTlsPassphraseChange = useCallback(
    async (index: number, value: string) => {
      if (mode !== "collection") return false
      const currentTls = settingsRef.current.tls ?? {}
      const profiles = currentTls.clientCertificates ?? []
      const profile = profiles[index]
      if (!profile) return false
      const secretId = profile.secretId ?? randomUUID()
      const dir = activeCollectionDirRef.current
      try {
        await persistCollectionSettingsTransaction(
          dir,
          (settings) => {
            const currentProfiles = settings.tls?.clientCertificates ?? []
            const targetIndex = certificateProfileIndex(
              currentProfiles,
              profile,
              index,
            )
            if (!currentProfiles[targetIndex]) return settings
            return {
              ...settings,
              tls: {
                ...settings.tls,
                clientCertificates: currentProfiles.map((item, current) =>
                  current === targetIndex
                    ? {
                        ...item,
                        secretId: value ? secretId : undefined,
                      }
                    : item,
                ),
              },
            }
          },
          [
            {
              get: () =>
                getCollectionSettingSecret(dir, `tls:${secretId}:passphrase`),
              set: (secret) =>
                setCollectionSettingSecret(
                  dir,
                  `tls:${secretId}:passphrase`,
                  secret,
                ),
              delete: () =>
                deleteCollectionSettingSecret(
                  dir,
                  `tls:${secretId}:passphrase`,
                ),
              value: value || undefined,
            },
          ],
        )
        setTlsPassphrases((current) => {
          const next = { ...current }
          if (
            value &&
            settingsRef.current.tls?.clientCertificates?.some(
              (item) => item.secretId === secretId,
            )
          ) {
            next[secretId] = value
          } else {
            delete next[secretId]
          }
          return next
        })
        return true
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : String(error),
          "error",
        )
        return false
      }
    },
    [mode, persistCollectionSettingsTransaction],
  )

  const handleTlsProfileRemove = useCallback(
    async (index: number) => {
      if (mode !== "collection") return false
      const currentTls = settingsRef.current.tls ?? {}
      const profiles = currentTls.clientCertificates ?? []
      const profile = profiles[index]
      if (!profile) return false
      const dir = activeCollectionDirRef.current
      try {
        const mutations = profile.secretId
          ? [
              {
                get: () =>
                  getCollectionSettingSecret(
                    dir,
                    `tls:${profile.secretId}:passphrase`,
                  ),
                set: (value: string) =>
                  setCollectionSettingSecret(
                    dir,
                    `tls:${profile.secretId}:passphrase`,
                    value,
                  ),
                delete: () =>
                  deleteCollectionSettingSecret(
                    dir,
                    `tls:${profile.secretId}:passphrase`,
                  ),
              },
            ]
          : []
        await persistCollectionSettingsTransaction(
          dir,
          (settings) => {
            const currentProfiles = settings.tls?.clientCertificates ?? []
            const targetIndex = certificateProfileIndex(
              currentProfiles,
              profile,
              index,
            )
            if (!currentProfiles[targetIndex]) return settings
            return {
              ...settings,
              tls: {
                ...settings.tls,
                clientCertificates: currentProfiles.filter(
                  (_, current) => current !== targetIndex,
                ),
              },
            }
          },
          mutations,
        )
        if (profile.secretId) {
          setTlsPassphrases((current) => {
            const next = { ...current }
            delete next[profile.secretId!]
            return next
          })
        }
        return true
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : String(error),
          "error",
        )
        return false
      }
    },
    [mode, persistCollectionSettingsTransaction],
  )

  const handleCollectionSettingsChange = useCallback(
    (
      patch: Pick<
        CollectionSettings,
        "name" | "description" | "timelineMaxEntries" | "tls" | "cookies"
      >,
    ) => {
      if (mode !== "collection") return false
      const previous = settingsRef.current
      const nextSettings = { ...previous, ...patch }
      const previousLimit =
        previous.timelineMaxEntries ?? DEFAULT_TIMELINE_MAX_ENTRIES
      const nextLimit =
        nextSettings.timelineMaxEntries ?? DEFAULT_TIMELINE_MAX_ENTRIES
      void queueCollectionSettingsSave(
        settingsPersistence,
        activeCollectionDir,
        (settings) => {
          if (!("tls" in patch)) {
            return { ...settings, ...patch }
          }
          return {
            ...settings,
            ...patch,
            tls: rebaseTlsSettings(settings.tls, previous.tls, patch.tls),
          }
        },
        saveSettings,
        setSettings,
        () => showToast("Failed to save collection settings", "error"),
        (persisted) => {
          setRegisteredCollectionSettings((current) => ({
            ...current,
            [activeCollectionDir]: persisted,
          }))
          if (nextLimit < previousLimit) {
            pruneTimeline(activeCollectionDir, nextLimit).catch(() =>
              showToast(
                "Timeline limit saved, but existing history could not be pruned",
                "error",
              ),
            )
          }
        },
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
      if (mode === "collection") {
        void queueCollectionSettingsSave(
          settingsPersistence,
          activeCollectionDir,
          (settings) => ({ ...settings, environment: envName }),
          saveSettings,
          setSettings,
          () => showToast("Failed to save active environment", "error"),
        )
      } else {
        const nextSettings = { ...settingsRef.current, environment: envName }
        settingsRef.current = nextSettings
        setSettings(nextSettings)
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
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error)
            showToast(`Failed to open collection: ${message}`, "error")
            return
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

        let nextCollectionProxyCredentials: ProxyCredentials = {}
        let nextTlsPassphrases: Record<string, string> = {}
        if (nextMode === "collection") {
          try {
            ;[nextCollectionProxyCredentials, nextTlsPassphrases] =
              await Promise.all([
                loadCollectionProxyCredentials(normalized, nextSettings.proxy),
                loadTlsPassphrases(normalized, nextSettings.tls),
              ])
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error)
            showToast(`Failed to load settings secrets: ${message}`, "error")
            return
          }
        }

        const pending = settingsSaveChainRef.current
        await pending
        if (pending !== settingsSaveChainRef.current) {
          showToast(
            "Settings changed while switching collections; try again",
            "error",
          )
          return
        }
        setEnvNames(nextEnvNames)
        setEnvColors(nextEnvColors)
        settingsRef.current = nextSettings
        persistedSettingsRef.current = nextSettings
        setSettings(nextSettings)
        setCollectionProxyCredentials(nextCollectionProxyCredentials)
        setTlsPassphrases(nextTlsPassphrases)
        setLastRequestId(nextLastRequestId)
        setInitialEnvNameState(undefined)
        setActiveCollectionDir(normalized)
        activeCollectionDirRef.current = normalized
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
        appConfigDir={CONFIG_DIR}
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
        externalEditors={externalEditors}
        externalEditor={externalEditor}
        onExternalEditorChange={handleExternalEditorChange}
        onLayoutChange={handleLayoutChange}
        onEnvChange={handleEnvChange}
        onEnvListChanged={handleEnvListChanged}
        settingsEnv={settingsEnv}
        appProxy={config.proxy}
        appProxyCredentials={appProxyCredentials}
        collectionProxy={settings.proxy}
        collectionProxyCredentials={collectionProxyCredentials}
        collectionTls={settings.tls}
        tlsPassphrases={tlsPassphrases}
        collectionName={settings.name}
        collectionDescription={settings.description}
        timelineMaxEntries={settings.timelineMaxEntries}
        cookiesEnabled={settings.cookies?.enabled ?? true}
        noProxy={noProxy}
        insecure={insecure}
        systemProxy={systemProxy}
        onAppProxyChange={handleAppProxyChange}
        onCollectionProxyChange={handleCollectionProxyChange}
        onAppProxyCredentialsChange={handleAppProxyCredentialsChange}
        onCollectionProxyCredentialsChange={
          handleCollectionProxyCredentialsChange
        }
        onProxyAuthDisable={handleProxyAuthDisable}
        onTlsPassphraseChange={handleTlsPassphraseChange}
        onTlsProfileRemove={handleTlsProfileRemove}
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
