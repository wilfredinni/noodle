import { afterAll, beforeEach, describe, expect, it, spyOn } from "bun:test"
import * as fsPromises from "node:fs/promises"
import { join, resolve } from "node:path"
import { act, useState } from "react"
import { KeymapProvider } from "@opentui/keymap/react"
import type { CollectionSettings, ScriptFields } from "../../src/schema"
import {
  CollectionScripts,
  type SaveCollectionScripts,
} from "../../src/ui/settings/CollectionScripts"
import { CodeEditorRenderable } from "../../src/ui/editor/CodeEditor"
import { setupKeymap } from "./_helpers"
import * as collectionPath from "../../src/collectionPath"
import * as envCatalog from "../../src/env/listWithColors"
import * as filestore from "../../src/filestore"
import * as configHooks from "../../src/hooks/useConfig"
import * as secrets from "../../src/secrets"
import * as appInner from "../../src/ui/AppInner"
import { bindingDefaults } from "../../src/ui/keybind"
import * as uiState from "../../src/ui/tabs/uiState"
import * as settingsPersistence from "../../src/ui/settings/settingsPersistence"
import { createTestRender } from "../testRender"

type EnvItem = { name: string; color?: string }
type AppInnerProps = {
  activeCollectionDir: string
  envNames: string[]
  envColors: Record<string, string | undefined>
  onCollectionChange: (dir: string) => void
  onEnvListChanged: (names?: string[]) => Promise<void>
  collectionScripts?: ScriptFields
  collectionSettingsByPath: Record<string, CollectionSettings>
  onCollectionSettingsChange: (patch: Partial<CollectionSettings>) => boolean
  onCollectionScriptsChange: SaveCollectionScripts
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const currentDir = resolve("/current")
const nextDir = resolve("/next")
let currentCalls = 0
let initialRefresh = deferred<EnvItem[]>()
let staleRefresh = deferred<EnvItem[]>()
let latestProps: AppInnerProps | undefined
let nextCollectionRenders: Pick<AppInnerProps, "envNames" | "envColors">[] = []
let showScripts = false
let setScriptsVisible: (visible: boolean) => void
const loadSettings = spyOn(filestore, "loadSettings").mockResolvedValue({})

const config = {
  theme: "noodle",
  layout: "stacked" as const,
  confirm_undo_all: true,
  collections: [],
}
const updateConfig = () => {}

const spies = [
  spyOn(fsPromises, "stat").mockResolvedValue({
    isDirectory: () => true,
  } as Awaited<ReturnType<typeof fsPromises.stat>>),
  spyOn(collectionPath, "classifyPath").mockReturnValue("collection"),
  loadSettings,
  spyOn(uiState, "loadLastRequest").mockResolvedValue(undefined),
  spyOn(secrets, "loadCollectionProxyCredentials").mockResolvedValue({}),
  spyOn(secrets, "loadTlsPassphrases").mockResolvedValue({}),
  spyOn(configHooks, "useConfig").mockReturnValue({ config, updateConfig }),
  spyOn(envCatalog, "listEnvironmentsWithColors").mockImplementation(
    (dir: string): Promise<EnvItem[]> => {
      if (dir === join(currentDir, ".environments")) {
        currentCalls++
        return currentCalls === 1
          ? initialRefresh.promise
          : staleRefresh.promise
      }
      if (dir === join(nextDir, ".environments")) {
        return Promise.resolve([{ name: "next", color: "success" }])
      }
      return Promise.resolve([])
    },
  ),
  spyOn(appInner, "AppInner").mockImplementation((props) => {
    const [scriptsVisible, setVisible] = useState(showScripts)
    setScriptsVisible = setVisible
    const observed: AppInnerProps = props
    latestProps = observed
    if (observed.activeCollectionDir === nextDir) {
      nextCollectionRenders.push({
        envNames: observed.envNames,
        envColors: observed.envColors,
      })
    }
    return scriptsVisible ? (
      <CollectionScripts
        key={props.activeCollectionDir}
        fields={props.collectionScripts ?? {}}
        pendingFields={props.collectionScriptDraft}
        focused
        onFocus={() => {}}
        onEditingChange={() => {}}
        onChange={props.onCollectionScriptsChange}
      />
    ) : null
  }),
]

const { App } = await import("../../src/ui/App")
const testRender = createTestRender()

afterAll(() => {
  for (const spy of spies) spy.mockRestore()
})

describe("App environment refreshes", () => {
  beforeEach(() => {
    currentCalls = 0
    initialRefresh = deferred<EnvItem[]>()
    staleRefresh = deferred<EnvItem[]>()
    latestProps = undefined
    nextCollectionRenders = []
    showScripts = false
    loadSettings.mockResolvedValue({})
  })

  it.each(["success", "failure"] as const)(
    "retains failed script drafts and newer edits after a delayed save %s",
    async (outcome) => {
      showScripts = true
      loadSettings.mockResolvedValue({ scripts: { pre: "const old=1" } })
      const failure = Promise.withResolvers<void>()
      const started = Promise.withResolvers<void>()
      const delayed = Promise.withResolvers<void>()
      const delayedStarted = Promise.withResolvers<void>()
      const save = spyOn(filestore, "saveSettings")
        .mockImplementationOnce(async () => {
          started.resolve()
          await failure.promise
        })
        .mockResolvedValue(undefined)
      const queue = settingsPersistence.queueCollectionSettingsSave
      let settled = Promise.resolve()
      const queueSpy = spyOn(
        settingsPersistence,
        "queueCollectionSettingsSave",
      ).mockImplementation((...args) => {
        const result = queue(...args)
        settled = result.catch(() => {})
        return result
      })
      try {
        const { keymap, host } = setupKeymap()
        const render = await act(async () =>
          testRender(
            <KeymapProvider keymap={keymap}>
              <App
                collectionDir={currentDir}
                initialSettings={{ scripts: { pre: "const old=1" } }}
                envList={[]}
                systemProxy={{ bypass: [] }}
                keybinds={bindingDefaults()}
                mode="collection"
              />
            </KeymapProvider>,
            { width: 90, height: 24 },
          ),
        )
        await act(async () => initialRefresh.resolve([]))
        await act(async () => host.press("down"))
        const editor = render.renderer.root.findDescendantById(
          "script-source",
        ) as CodeEditorRenderable
        const edited = "const edited=2"
        await act(async () => editor.replaceText(edited))
        await act(async () => {
          host.press("escape")
          await started.promise
        })
        await act(async () => host.press("down"))
        await act(async () => host.press("escape"))
        expect(queueSpy).toHaveBeenCalledTimes(1)
        await act(async () => setScriptsVisible(false))
        if (outcome === "failure") {
          await act(async () => setScriptsVisible(true))
          await act(async () => host.press("down"))
          await act(async () => host.press("escape"))
          expect(queueSpy).toHaveBeenCalledTimes(1)
        }
        await act(async () => {
          failure.reject(new Error("disk full"))
          await settled
        })
        if (outcome === "success")
          await act(async () => setScriptsVisible(true))
        let restored = render.renderer.root.findDescendantById(
          "script-source",
        ) as CodeEditorRenderable
        expect(restored.plainText).toBe(edited)
        expect(latestProps?.collectionScripts?.scripts?.pre).toBe("const old=1")
        await act(async () => host.press("down"))
        await act(async () => {
          host.press("escape")
          await settled
        })
        expect(save).toHaveBeenCalledTimes(2)
        expect(save.mock.calls[1]?.[1].scripts?.pre).toBe(edited)
        expect(latestProps?.collectionScripts?.scripts?.pre).toBe(edited)

        save.mockImplementationOnce(async () => {
          delayedStarted.resolve()
          await delayed.promise
        })
        await act(async () => host.press("down"))
        await act(async () => restored.replaceText("const saving=3"))
        await act(async () => {
          host.press("escape")
          await delayedStarted.promise
        })
        await act(async () => setScriptsVisible(false))
        await act(async () => setScriptsVisible(true))
        restored = render.renderer.root.findDescendantById(
          "script-source",
        ) as CodeEditorRenderable
        await act(async () => host.press("down"))
        await act(async () => restored.replaceText("const newer=4"))
        await act(async () => {
          if (outcome === "success") delayed.resolve()
          else delayed.reject(new Error("disk full"))
          await settled
        })
        expect(restored.plainText).toBe("const newer=4")
        await act(async () => {
          host.press("escape")
          await settled
        })
        expect(save).toHaveBeenCalledTimes(4)
        expect(save.mock.calls[3]?.[1].scripts?.pre).toBe("const newer=4")
        await act(async () => setScriptsVisible(false))
        await act(async () => setScriptsVisible(true))
        await act(async () => host.press("down"))
        await act(async () => host.press("escape"))
        expect(save).toHaveBeenCalledTimes(4)
        await act(async () => {
          expect(
            latestProps!.onCollectionSettingsChange({ name: "Renamed" }),
          ).toBe(true)
          await settled
        })
      } finally {
        failure.resolve()
        delayed.resolve()
        await act(async () => settled)
        save.mockRestore()
        queueSpy.mockRestore()
      }
    },
  )

  it("saves an unmounted script draft against its original collection settings", async () => {
    const original: CollectionSettings = {
      name: "Original",
      environment: "current",
      proxy: { mode: "off" },
      cookies: { enabled: false },
    }
    const next: CollectionSettings = {
      name: "Next",
      environment: "next",
      proxy: { mode: "inherit" },
      cookies: { enabled: true },
    }
    showScripts = true
    loadSettings.mockResolvedValue(next)
    const saved = deferred<void>()
    const save = spyOn(filestore, "saveSettings").mockImplementation(
      async () => {
        saved.resolve()
      },
    )
    const { keymap, host } = setupKeymap()
    try {
      const h = await act(async () =>
        testRender(
          <KeymapProvider keymap={keymap}>
            <App
              collectionDir={currentDir}
              envList={["current"]}
              initialSettings={original}
              systemProxy={{ bypass: [] }}
              keybinds={bindingDefaults()}
              mode="collection"
            />
          </KeymapProvider>,
          { width: 90, height: 23 },
        ),
      )
      await act(async () => {
        initialRefresh.resolve([{ name: "current" }])
        await initialRefresh.promise
      })
      await act(async () => host.press("down"))
      const editor = h.renderer.root.findDescendantById(
        "script-source",
      ) as CodeEditorRenderable
      await act(async () => editor.insertText('console.info("edited")'))
      expect(save).not.toHaveBeenCalled()
      await act(async () => latestProps!.onCollectionChange(nextDir))
      await act(async () => saved.promise)
      expect(save.mock.calls[0]).toEqual([
        currentDir,
        {
          ...original,
          scripts: { pre: 'console.info("edited")' },
          tests: undefined,
        },
      ])
      expect(latestProps?.collectionSettingsByPath[currentDir]?.name).toBe(
        "Original",
      )
      expect(
        latestProps?.collectionSettingsByPath[currentDir]?.scripts?.pre,
      ).toBe('console.info("edited")')
      expect(latestProps?.collectionSettingsByPath[nextDir]).toEqual(next)
      expect(latestProps?.collectionScripts).toEqual(next)
    } finally {
      save.mockRestore()
    }
  })

  it("does not let a refresh from the previous collection overwrite the next collection", async () => {
    const render = await act(async () =>
      testRender(
        <App
          collectionDir={currentDir}
          envList={["current"]}
          systemProxy={{ bypass: [] }}
          keybinds={bindingDefaults()}
          mode="collection"
        />,
        { width: 20, height: 4 },
      ),
    )

    await act(async () => {
      initialRefresh.resolve([{ name: "current", color: "info" }])
      await render.renderOnce()
    })

    await act(async () => {
      const pendingRefresh = latestProps!.onEnvListChanged(["optimistic"])
      await latestProps!.onCollectionChange(nextDir)
      staleRefresh.resolve([{ name: "stale", color: "error" }])
      await pendingRefresh
    })

    expect(latestProps?.activeCollectionDir).toBe(nextDir)
    expect(latestProps?.envNames).toEqual(["next"])
    expect(latestProps?.envColors).toEqual({ next: "success" })
    expect(
      nextCollectionRenders.some(
        ({ envNames, envColors }) =>
          envNames.includes("stale") || envColors.stale === "error",
      ),
    ).toBeFalse()
  })
})
