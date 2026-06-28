import { useCallback, useEffect, useState } from "react"
import { AppInner } from "./AppInner"
import { useConfig } from "./useConfig"
import { listEnvironmentsWithColors } from "../env/listWithColors"
import { ThemeProvider } from "./theme"
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
}: {
  collectionDir: string
  environmentsDir: string
  envList: string[]
  initialEnvName?: string
  settingsEnv?: string
  keybinds: Keybinds
}) {
  const { config, updateConfig } = useConfig(CONFIG_DIR)
  const [settingsEnv, setSettingsEnv] = useState<string | undefined>(
    initialSettingsEnv,
  )

  const [activeIndex, setActiveIndex] = useState(config.theme)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)

  const handleThemeChange = useCallback(
    (index: number) => {
      setActiveIndex(index)
      updateConfig({ theme: index })
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
  const [envColors, setEnvColors] = useState<Record<string, string | undefined>>({})

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
        initialLayout={config.layout}
        onLayoutChange={handleLayoutChange}
        onEnvChange={handleEnvChange}
        onEnvListChanged={handleEnvListChanged}
        settingsEnv={settingsEnv}
      />
    </ThemeProvider>
  )
}
