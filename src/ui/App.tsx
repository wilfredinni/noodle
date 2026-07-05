import { useCallback, useEffect, useState } from "react"
import { AppInner } from "./AppInner"
import { useConfig } from "../hooks/useConfig"
import { listEnvironmentsWithColors } from "../env/listWithColors"
import { ThemeProvider, THEMES, DEFAULT_THEME_INDEX } from "./theme"
import { Toast } from "./Toast"
import { saveSettings } from "../filestore"
import type { Keybinds } from "./keybind"

const CONFIG_DIR = `${process.env.HOME ?? "~"}/.config/noodle`

export function App({
  collectionDir,
  environmentsDir,
  envList: initialEnvList,
  initialEnvName,
  settingsEnv: initialSettingsEnv,
  keybinds: keybinds,
  lastRequestId,
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
  const [settingsEnv, setSettingsEnv] = useState<string | undefined>(
    initialSettingsEnv,
  )

  const [activeIndex, setActiveIndex] = useState(() => {
    const idx = THEMES.findIndex((t) => t.name === config.theme)
    return idx !== -1 ? idx : DEFAULT_THEME_INDEX
  })
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)

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

  const [envNames, setEnvNames] = useState<string[]>(initialEnvList)
  const [envColors, setEnvColors] = useState<
    Record<string, string | undefined>
  >({})

  useEffect(() => {
    listEnvironmentsWithColors(environmentsDir).then((items) => {
      const colors: Record<string, string | undefined> = {}
      for (const item of items) colors[item.name] = item.color
      setEnvColors(colors)
    })
  }, [environmentsDir])

  const handleEnvListChanged = useCallback(async () => {
    const items = await listEnvironmentsWithColors(environmentsDir)
    setEnvNames(items.map((i) => i.name))
    const colors: Record<string, string | undefined> = {}
    for (const item of items) colors[item.name] = item.color
    setEnvColors(colors)
  }, [environmentsDir])

  const handleEnvChange = useCallback(
    (name: string | null) => {
      const envName = name ?? undefined
      setSettingsEnv(envName)
      saveSettings(collectionDir, { environment: envName }).catch(() => {})
    },
    [collectionDir],
  )

  return (
    <ThemeProvider activeIndex={activeIndex} previewIndex={previewIndex}>
      <Toast />
      <AppInner
        collectionDir={collectionDir}
        environmentsDir={environmentsDir}
        envNames={envNames}
        envColors={envColors}
        initialEnvName={initialEnvName}
        activeIndex={activeIndex}
        previewIndex={previewIndex}
        setPreviewIndex={setPreviewIndex}
        onThemeChange={handleThemeChange}
        keybinds={keybinds}
        initialLastRequestId={lastRequestId}
        initialLayout={config.layout}
        confirmUndoAll={config.confirm_undo_all}
        onLayoutChange={handleLayoutChange}
        onEnvChange={handleEnvChange}
        onEnvListChanged={handleEnvListChanged}
        settingsEnv={settingsEnv}
      />
    </ThemeProvider>
  )
}
