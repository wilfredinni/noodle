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

function persistence(settings: CollectionSettings) {
  return {
    activeCollectionDir: { current: "/collection" },
    currentSettings: { current: settings },
    persistedSettings: { current: settings },
    saveChain: { current: Promise.resolve() },
    pendingUpdates: { current: [] },
  }
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe("queueCollectionSettingsSave", () => {
  it("runs the success callback only after settings persist", async () => {
    const state = persistence({})
    const first = deferred()
    let saved = 0

    void queueCollectionSettingsSave(
      state,
      "/collection",
      (settings) => ({ ...settings, timelineMaxEntries: 10 }),
      async () => first.promise,
      () => {},
      () => {},
      () => {
        saved++
      },
    )
    expect(saved).toBe(0)
    first.resolve()
    await state.saveChain.current
    expect(saved).toBe(1)
  })

  it("skips the success callback for a superseded mutation", async () => {
    const state = persistence({})
    const first = deferred()
    let saved = 0

    void queueCollectionSettingsSave(
      state,
      "/collection",
      (settings) => ({ ...settings, timelineMaxEntries: 10 }),
      async () => first.promise,
      () => {},
      () => {},
      () => {
        saved++
      },
    )
    void queueCollectionSettingsSave(
      state,
      "/collection",
      (settings) => ({ ...settings, environment: "development" }),
      async () => {},
      () => {},
      () => {},
    )

    first.resolve()
    await state.saveChain.current
    expect(saved).toBe(0)
  })

  it("rebases later edits onto a delayed settings transaction", async () => {
    const state = persistence({
      proxy: { mode: "custom", url: "http://proxy.test" },
    })
    const transaction = deferred()
    const saves: CollectionSettings[] = []

    void queueCollectionSettingsSave(
      state,
      "/collection",
      (settings) => ({
        ...settings,
        proxy:
          settings.proxy?.mode === "custom"
            ? { ...settings.proxy, auth: true }
            : settings.proxy,
      }),
      async (_dir, settings) => {
        saves.push(settings)
        await transaction.promise
      },
      () => {},
      () => {},
    )
    void queueCollectionSettingsSave(
      state,
      "/collection",
      (settings) => ({
        ...settings,
        name: "Payments",
      }),
      async (_dir, settings) => {
        saves.push(settings)
      },
      () => {},
      () => {},
    )

    expect(state.currentSettings.current).toMatchObject({
      name: "Payments",
      proxy: { auth: true },
    })
    transaction.resolve()
    await state.saveChain.current
    expect(saves.at(-1)).toMatchObject({
      name: "Payments",
      proxy: { auth: true },
    })
    expect(state.persistedSettings.current).toEqual(saves.at(-1)!)
  })

  it("does not resurrect a TLS profile removed after a delayed passphrase save", async () => {
    const state = persistence({
      tls: {
        clientCertificates: [
          { host: "api.test", certFile: "cert.pem", keyFile: "key.pem" },
        ],
      },
    })
    const transaction = deferred()
    const secretId = "secret-id"

    void queueCollectionSettingsSave(
      state,
      "/collection",
      (settings) => ({
        ...settings,
        tls: {
          ...settings.tls,
          clientCertificates: settings.tls?.clientCertificates?.map(
            (profile, index) =>
              index === 0 ? { ...profile, secretId } : profile,
          ),
        },
      }),
      async () => transaction.promise,
      () => {},
      () => {},
    )
    void queueCollectionSettingsSave(
      state,
      "/collection",
      (settings) => ({
        ...settings,
        tls: {
          ...settings.tls,
          clientCertificates:
            settings.tls?.clientCertificates?.filter(
              (profile) => profile.secretId !== secretId,
            ) ?? [],
        },
      }),
      async () => {},
      () => {},
      () => {},
    )

    expect(state.currentSettings.current.tls?.clientCertificates).toEqual([])
    transaction.resolve()
    await state.saveChain.current
    expect(state.persistedSettings.current.tls?.clientCertificates).toEqual([])
  })

  it("rolls back only a failed mutation and preserves later pending edits", async () => {
    const state = persistence({ environment: "development" })
    const proxySave = deferred()
    const environmentSave = deferred()
    let rendered = state.currentSettings.current

    void queueCollectionSettingsSave(
      state,
      "/collection",
      (settings) => ({ ...settings, proxy: { mode: "off" } }),
      async () => proxySave.promise,
      (settings) => {
        rendered = settings
      },
      () => {},
    )
    void queueCollectionSettingsSave(
      state,
      "/collection",
      (settings) => ({ ...settings, environment: "production" }),
      async () => environmentSave.promise,
      (settings) => {
        rendered = settings
      },
      () => {},
    )

    await flush()
    proxySave.reject(new Error("proxy save failed"))
    await flush()
    expect(rendered).toEqual({ environment: "production" })

    environmentSave.resolve()
    await state.saveChain.current
    expect(state.persistedSettings.current).toEqual({
      environment: "production",
    })
  })
})
