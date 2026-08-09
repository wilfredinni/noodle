import type { CollectionSettings } from "../../schema"

export interface CollectionSettingsPersistence {
  activeCollectionDir: { current: string }
  currentSettings: { current: CollectionSettings }
  persistedSettings: { current: CollectionSettings }
  saveChain: { current: Promise<void> }
}

export function queueCollectionSettingsSave(
  persistence: CollectionSettingsPersistence,
  collectionDir: string,
  settings: CollectionSettings,
  saveSettings: (dir: string, settings: CollectionSettings) => Promise<void>,
  setSettings: (settings: CollectionSettings) => void,
  onError: () => void,
  onSaved?: () => void,
): void {
  const save = persistence.saveChain.current.then(() =>
    saveSettings(collectionDir, settings),
  )
  persistence.saveChain.current = save.catch(() => {})
  save.then(
    () => {
      if (persistence.activeCollectionDir.current === collectionDir) {
        persistence.persistedSettings.current = settings
      }
      if (persistence.currentSettings.current === settings) {
        onSaved?.()
      }
    },
    () => {
      if (
        persistence.activeCollectionDir.current === collectionDir &&
        persistence.currentSettings.current === settings
      ) {
        persistence.currentSettings.current =
          persistence.persistedSettings.current
        setSettings(persistence.persistedSettings.current)
      }
      onError()
    },
  )
}
