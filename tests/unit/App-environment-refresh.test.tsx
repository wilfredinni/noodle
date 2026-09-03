import { afterAll, beforeEach, describe, expect, it, spyOn } from "bun:test"
import * as fsPromises from "node:fs/promises"
import { join, resolve } from "node:path"
import { act } from "react"
import * as collectionPath from "../../src/collectionPath"
import * as envCatalog from "../../src/env/listWithColors"
import * as filestore from "../../src/filestore"
import * as configHooks from "../../src/hooks/useConfig"
import * as secrets from "../../src/secrets"
import * as appInner from "../../src/ui/AppInner"
import { bindingDefaults } from "../../src/ui/keybind"
import * as uiState from "../../src/ui/tabs/uiState"
import { createTestRender } from "../testRender"

type EnvItem = { name: string; color?: string }
type AppInnerProps = {
  activeCollectionDir: string
  envNames: string[]
  envColors: Record<string, string | undefined>
  onCollectionChange: (dir: string) => void
  onEnvListChanged: (names?: string[]) => Promise<void>
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
  spyOn(filestore, "loadSettings").mockResolvedValue({}),
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
    const observed: AppInnerProps = props
    latestProps = observed
    if (observed.activeCollectionDir === nextDir) {
      nextCollectionRenders.push({
        envNames: observed.envNames,
        envColors: observed.envColors,
      })
    }
    return null
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
