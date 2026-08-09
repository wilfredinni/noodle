import { describe, expect, it } from "bun:test"
import type { CollectionSettings } from "../../src/schema"
import { queueCollectionSettingsSave } from "../../src/ui/settings/settingsPersistence"

function deferred(): {
  promise: Promise<void>
  resolve: () => void
  reject: (error: Error) => void
} {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe("queueCollectionSettingsSave", () => {
  it("runs the success callback only after settings persist", async () => {
    const persisted: CollectionSettings = { timelineMaxEntries: 10 }
    const persistence = {
      activeCollectionDir: { current: "/collection" },
      currentSettings: { current: persisted },
      persistedSettings: { current: {} },
      saveChain: { current: Promise.resolve() },
    }
    let saved = false

    queueCollectionSettingsSave(
      persistence,
      "/collection",
      persisted,
      async () => {},
      () => {},
      () => {},
      () => {
        saved = true
      },
    )
    expect(saved).toBe(false)
    await persistence.saveChain.current
    await flush()
    expect(saved).toBe(true)
  })

  it("restores persisted settings when superseded proxy and environment saves fail", async () => {
    const persisted: CollectionSettings = { environment: "development" }
    const proxySettings: CollectionSettings = {
      ...persisted,
      proxy: { mode: "off" },
    }
    const currentSettings: CollectionSettings = {
      ...proxySettings,
      environment: "production",
    }
    const proxySave = deferred()
    const environmentSave = deferred()
    const saves = [proxySave, environmentSave]
    const persistence = {
      activeCollectionDir: { current: "/collection" },
      currentSettings: { current: proxySettings },
      persistedSettings: { current: persisted },
      saveChain: { current: Promise.resolve() },
    }
    let renderedSettings = proxySettings

    queueCollectionSettingsSave(
      persistence,
      "/collection",
      proxySettings,
      () => saves.shift()!.promise,
      (settings) => {
        renderedSettings = settings
      },
      () => {},
    )
    persistence.currentSettings.current = currentSettings
    queueCollectionSettingsSave(
      persistence,
      "/collection",
      currentSettings,
      () => saves.shift()!.promise,
      (settings) => {
        renderedSettings = settings
      },
      () => {},
    )

    await flush()
    proxySave.reject(new Error("proxy save failed"))
    await flush()
    environmentSave.reject(new Error("environment save failed"))
    await flush()

    expect(persistence.currentSettings.current).toEqual(persisted)
    expect(renderedSettings).toEqual(persisted)
  })

  it("skips the success callback for superseded settings", async () => {
    const first = deferred()
    const persistedSettings: CollectionSettings = { timelineMaxEntries: 50 }
    const oldSettings: CollectionSettings = { timelineMaxEntries: 10 }
    const currentSettings: CollectionSettings = { timelineMaxEntries: 50 }
    const persistence = {
      activeCollectionDir: { current: "/collection" },
      currentSettings: { current: oldSettings },
      persistedSettings: { current: persistedSettings },
      saveChain: { current: Promise.resolve() },
    }
    let saved = 0

    queueCollectionSettingsSave(
      persistence,
      "/collection",
      oldSettings,
      async () => first.promise,
      () => {},
      () => {},
      () => {
        saved++
      },
    )
    persistence.currentSettings.current = currentSettings
    queueCollectionSettingsSave(
      persistence,
      "/collection",
      currentSettings,
      async () => {},
      () => {},
      () => {},
    )

    first.resolve()
    await persistence.saveChain.current
    await flush()

    expect(saved).toBe(0)
  })
})
