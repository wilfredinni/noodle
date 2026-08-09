import { describe, expect, it } from "bun:test"
import type { CollectionSettings } from "../../src/schema"
import { queueCollectionSettingsSave } from "../../src/ui/settings/settingsPersistence"

function deferred(): {
  promise: Promise<void>
  reject: (error: Error) => void
} {
  let reject!: (error: Error) => void
  const promise = new Promise<void>((_, rejectPromise) => {
    reject = rejectPromise
  })
  return { promise, reject }
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe("queueCollectionSettingsSave", () => {
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
})
