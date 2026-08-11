import type { CollectionSettings } from "../../schema"

export type CollectionSettingsUpdate = (
  settings: CollectionSettings,
) => CollectionSettings

export interface CollectionSettingsPersistence {
  activeCollectionDir: { current: string }
  currentSettings: { current: CollectionSettings }
  persistedSettings: { current: CollectionSettings }
  saveChain: { current: Promise<void> }
  pendingUpdates: { current: CollectionSettingsUpdate[] }
}

function renderPendingSettings(
  persistence: CollectionSettingsPersistence,
  collectionDir: string,
  setSettings: (settings: CollectionSettings) => void,
): void {
  if (persistence.activeCollectionDir.current !== collectionDir) return
  const settings = persistence.pendingUpdates.current.reduce(
    (current, update) => update(current),
    persistence.persistedSettings.current,
  )
  persistence.currentSettings.current = settings
  setSettings(settings)
}

export function queueCollectionSettingsSave(
  persistence: CollectionSettingsPersistence,
  collectionDir: string,
  update: CollectionSettingsUpdate,
  saveSettings: (
    dir: string,
    settings: CollectionSettings,
  ) => Promise<void | CollectionSettings>,
  setSettings: (settings: CollectionSettings) => void,
  onError: () => void,
  onSaved?: (settings: CollectionSettings) => void,
): Promise<void> {
  persistence.pendingUpdates.current.push(update)
  renderPendingSettings(persistence, collectionDir, setSettings)

  const save = persistence.saveChain.current.then(async () => {
    try {
      const current = persistence.persistedSettings.current
      const next = update(current)
      if (next === current) return
      const persisted = (await saveSettings(collectionDir, next)) ?? next
      if (persistence.activeCollectionDir.current === collectionDir) {
        persistence.persistedSettings.current = persisted
      }
    } catch (error) {
      onError()
      throw error
    } finally {
      const index = persistence.pendingUpdates.current.indexOf(update)
      if (index !== -1) persistence.pendingUpdates.current.splice(index, 1)
      renderPendingSettings(persistence, collectionDir, setSettings)
    }

    if (persistence.pendingUpdates.current.length === 0) {
      onSaved?.(persistence.persistedSettings.current)
    }
  })
  persistence.saveChain.current = save.catch(() => {})
  return save
}
