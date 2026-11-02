import { expect, it, spyOn } from "bun:test"
import { act, type ComponentProps } from "react"
import { useRenderer } from "@opentui/react"
import { KeymapProvider } from "@opentui/keymap/react"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { App } from "../../src/ui/App"
import * as inner from "../../src/ui/AppInner"
import * as hooks from "../../src/hooks/useCollectionRunner"
import * as config from "../../src/hooks/useConfig"
import * as store from "../../src/filestore"
import * as toast from "../../src/ui/Toast"
import { RendererProvider } from "../../src/ui/RendererContext"
import { bindingDefaults } from "../../src/ui/keybind"
import { summarizeRun } from "../../src/app/services"
import { createTestRender, waitForHookState } from "../testRender"
import { setupKeymap } from "./_helpers"

const testRender = createTestRender()

it.each([false, true])(
  "blocks Runner until queued hook saves settle (failure: %s)",
  async (fail) => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-runner-settings-"))
    const { keymap, host, cleanup } = setupKeymap()
    const initialSettings = {
      cookies: { enabled: false },
      hooks: { setup: "old" },
    }
    for (const id of ["old", "new", "main"])
      await store.saveRequest(dir, {
        id,
        name: id,
        method: "GET",
        url: "https://example.com",
        headers: {},
        params: [],
        timeout: 0,
      })
    await store.saveSettings(dir, initialSettings)
    const first = Promise.withResolvers<void>()
    const second = Promise.withResolvers<void>()
    const useRunner = hooks.useCollectionRunner
    const appInner = inner.AppInner
    const saveSettings = store.saveSettings
    let app!: ComponentProps<typeof inner.AppInner>
    let runner!: hooks.UseCollectionRunnerResult
    let saves = 0
    const executedHooks: unknown[] = []
    const spies = [
      spyOn(config, "useConfig").mockReturnValue({
        config: {
          theme: "noodle",
          layout: "stacked",
          confirm_undo_all: false,
          collections: [dir],
        },
        updateConfig: () => {},
      }),
      spyOn(inner, "AppInner").mockImplementation((props) => {
        app = props
        return appInner(props)
      }),
      spyOn(hooks, "useCollectionRunner").mockImplementation((options) => {
        runner = useRunner({
          ...options,
          runCollection: async () => {
            executedHooks.push((await store.loadSettings(dir)).hooks)
            return {
              results: [],
              skipped: [],
              failed: false,
              summary: summarizeRun([], 0, 0, performance.now()),
            }
          },
        })
        return runner
      }),
      spyOn(store, "saveSettings").mockImplementation(
        async (path, settings) => {
          const call = ++saves
          await (call === 1 ? first.promise : second.promise)
          if (fail && call === 1) throw new Error("save failed")
          await saveSettings(path, settings)
        },
      ),
    ]
    const notification = spyOn(toast, "showToast").mockImplementation(() => {})
    let render: Awaited<ReturnType<typeof testRender>> | undefined
    function Harness() {
      const renderer = useRenderer()
      return (
        <RendererProvider renderer={renderer}>
          <App
            collectionDir={dir}
            envList={[]}
            initialSettings={initialSettings}
            noProxy
            systemProxy={{ bypass: [] }}
            keybinds={bindingDefaults()}
            mode="collection"
          />
        </RendererProvider>
      )
    }
    try {
      render = await act(async () =>
        testRender(
          <KeymapProvider keymap={keymap}>
            <Harness />
          </KeymapProvider>,
          { width: 100, height: 28 },
        ),
      )
      await waitForHookState(render, () => runner.requests.length === 2)
      await act(async () => {
        host.press("f5")
      })
      await waitForHookState(render, () => runner.canRun)
      await act(async () => {
        app.onCollectionSettingsChange({ hooks: { setup: "new" } })
        app.onCollectionSettingsChange({ description: "queued edit" })
      })
      expect(app.collectionHooks).toEqual({ setup: "new" })
      expect(runner.canRun).toBe(false)
      await act(async () => runner.run())
      expect(executedHooks).toEqual([])
      await act(async () => first.resolve())
      await waitForHookState(render, () => saves === 2)
      expect(runner.canRun).toBe(false)
      await act(async () => runner.run())
      expect(executedHooks).toEqual([])
      await act(async () => second.resolve())
      await waitForHookState(render, () => runner.canRun)
      await act(async () => runner.run())
      expect(executedHooks).toEqual([{ setup: fail ? "old" : "new" }])
      expect(app.collectionHooks).toEqual({ setup: fail ? "old" : "new" })
      expect(
        notification.mock.calls.filter(
          ([message]) => message === "Failed to save collection settings",
        ),
      ).toHaveLength(fail ? 1 : 0)
    } finally {
      await act(async () => {
        first.resolve()
        second.resolve()
      })
      if (render) await act(async () => render!.renderer.destroy())
      for (const spy of spies) spy.mockRestore()
      notification.mockRestore()
      cleanup()
      await rm(dir, { recursive: true, force: true })
    }
  },
)
