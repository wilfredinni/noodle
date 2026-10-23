import { expect, it, spyOn } from "bun:test"
import { act, type ComponentProps } from "react"
import { useRenderer } from "@opentui/react"
import { KeymapProvider } from "@opentui/keymap/react"
import { mkdtemp, mkdir, rm, writeFile, rename } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { App } from "../../src/ui/App"
import * as inner from "../../src/ui/AppInner"
import * as views from "../../src/ui/MainView"
import * as overlays from "../../src/ui/AppOverlays"
import * as settings from "../../src/ui/settings/SettingsView"
import * as hooks from "../../src/hooks/useCollectionRunner"
import * as config from "../../src/hooks/useConfig"
import * as toast from "../../src/ui/Toast"
import { RendererProvider } from "../../src/ui/RendererContext"
import { bindingDefaults } from "../../src/ui/keybind"
import { filestore } from "../../src/filestore"
import {
  summarizeRun,
  type collectionRun,
  type RequestRunResult,
} from "../../src/app/services"
import { createTestRender, waitForHookState } from "../testRender"
import { setupKeymap } from "./_helpers"

const testRender = createTestRender()
it("retains results through App collection switches and navigates source owners before returning with F5", async () => {
  const root = await mkdtemp(join(tmpdir(), "noodle-session-app-"))
  const a = join(root, "a"),
    b = join(root, "b")
  const { keymap, host, cleanup } = setupKeymap()
  let runner!: hooks.UseCollectionRunnerResult
  let app!: ComponentProps<typeof inner.AppInner>
  let main!: ComponentProps<typeof views.MainView>
  let modal!: ComponentProps<typeof overlays.AppOverlays>
  let preferences!: ComponentProps<typeof settings.SettingsView>
  const useRunner = hooks.useCollectionRunner,
    appInner = inner.AppInner,
    mainView = views.MainView,
    appOverlays = overlays.AppOverlays,
    settingsView = settings.SettingsView
  const runCollection: typeof collectionRun = async (...args) => {
    const results: RequestRunResult[] = [0, 1].map((iteration) => ({
      id: "folder/request",
      iteration,
      method: "GET",
      url: "https://example.com",
      ok: false,
      failureCategories: ["script"],
      scripts: {
        evaluated: true,
        results: [
          {
            phase: "post",
            scope: "request",
            sourceKind: "inline",
            source: {
              scope: "request",
              scopeId: "folder/request",
              path: "folder/request.yml",
            },
            success: false,
            durationMs: 1,
            logs: [],
            error: { name: "Error", message: "failed" },
          },
        ],
      },
    }))
    for (const result of results)
      args[10]?.({
        requestId: result.id,
        iteration: result.iteration,
        entry: {
          timestamp: 1,
          request: {
            id: result.id,
            name: "Original request",
            method: "GET",
            url: result.url,
            headers: {},
            params: [],
          },
          error: { message: "failed" },
        },
      })
    return {
      iterations: 2,
      results,
      skipped: [],
      failed: true,
      summary: summarizeRun(results, 2, 0, performance.now()),
    }
  }
  const spies = [
    spyOn(config, "useConfig").mockReturnValue({
      config: {
        theme: "noodle",
        layout: "stacked",
        confirm_undo_all: false,
        collections: [a, b],
      },
      updateConfig: () => {},
    }),
    spyOn(hooks, "useCollectionRunner").mockImplementation((options) => {
      runner = useRunner({ ...options, runCollection })
      return runner
    }),
    spyOn(inner, "AppInner").mockImplementation((props) => {
      app = props
      return appInner(props)
    }),
    spyOn(views, "MainView").mockImplementation((props) => {
      main = props
      return mainView(props)
    }),
    spyOn(overlays, "AppOverlays").mockImplementation((props) => {
      modal = props
      return appOverlays(props)
    }),
    spyOn(settings, "SettingsView").mockImplementation((props) => {
      preferences = props
      return settingsView(props)
    }),
  ]
  const notification = spyOn(toast, "showToast").mockImplementation(() => {})
  let render: Awaited<ReturnType<typeof testRender>> | undefined
  function Harness() {
    const renderer = useRenderer()
    return (
      <RendererProvider renderer={renderer}>
        <App
          collectionDir={a}
          envList={[]}
          initialSettings={{
            cookies: { enabled: false },
            timelineMaxEntries: 0,
          }}
          noProxy
          systemProxy={{ bypass: [] }}
          keybinds={bindingDefaults()}
          mode="collection"
        />
      </RendererProvider>
    )
  }
  try {
    for (const dir of [a, b]) {
      await mkdir(join(dir, "folder"), { recursive: true })
      await writeFile(
        join(dir, "settings.yml"),
        "cookies:\n  enabled: false\ntimeline_max_entries: 0\ntests: \"test('collection', () => {})\"\n",
      )
      await writeFile(
        join(dir, "folder", "folder.yml"),
        'meta:\n  name: Folder\nscripts:\n  post: "./missing.js"\n',
      )
      for (const id of ["first", "folder/request"])
        await filestore.saveRequest(dir, {
          id,
          name: id === "first" ? "First" : "Original request",
          method: "GET",
          url: "https://example.com",
          headers: {},
          params: [],
          timeout: 0,
          scripts: { post: "console.log('old')" },
        })
    }
    render = await act(async () =>
      testRender(
        <KeymapProvider keymap={keymap}>
          <Harness />
        </KeymapProvider>,
        { width: 80, height: 24 },
      ),
    )
    await waitForHookState(render, () => !main.loading)
    expect(main.error).toBeNull()
    expect(runner.requests).toHaveLength(2)
    await act(async () => host.press("f5"))
    await act(async () => {
      await runner.run()
    })
    const retained = runner.result
    await act(async () => runner.setResultIndex(1))
    await act(async () => host.press("return"))
    expect(modal.overlays.runnerDetail?.iteration).toBe(1)
    await act(async () => host.press("o"))
    expect(main.selectedId).toBe("folder/request")
    expect(keymap.getData("app.focus")).toBe("urlbar")
    await act(async () => host.press("f5"))
    expect(runner.result).toBe(retained)
    expect(runner.resultIndex).toBe(1)
    await act(async () => host.press("return"))
    await act(async () => host.press("right"))
    await act(async () => host.press("right"))
    await act(async () => host.press("o"))
    expect(main.selectedId).toBe("folder/request")
    expect(main.eb.activeTab).toBe("postScript")
    await act(async () => main.draft.setScript("post", "console.log('edited')"))
    await act(async () => host.press("f5"))
    expect(runner.result).toBe(retained)
    expect(runner.resultIndex).toBe(1)
    expect(runner.canRun).toBe(false)
    await act(async () => {
      expect(
        modal.onOpenRunnerSource!("folder/request", {
          tab: "postScript",
          source: {
            scope: "folder",
            scopeId: "folder",
            path: "folder/folder.yml",
            sourceKind: "external",
            sourcePath: "./missing.js",
          },
        }),
      ).toBe(true)
    })
    expect(main.focusedFolderPresent).toBe(true)
    expect(main.folderEb.activeTab).toBe("postScript")
    await act(async () => host.press("f5"))
    await act(async () => {
      expect(
        modal.onOpenRunnerSource!("folder/request", {
          tab: "tests",
          source: { scope: "collection", path: "settings.yml" },
        }),
      ).toBe(true)
    })
    expect(preferences.scope).toBe("collection")
    expect(preferences.category).toBe("scripts")
    expect(preferences.initialScriptPhase).toBe("tests")
    await act(async () => host.press("f5"))
    expect(runner.result).toBe(retained)
    await act(async () => app.onCollectionChange(b))
    await waitForHookState(
      render,
      () => runner.collectionDir === b && runner.requests.length === 2,
    )
    expect(runner.result).toBeNull()
    await act(async () => app.onCollectionChange(a))
    await waitForHookState(
      render,
      () => runner.collectionDir === a && runner.requests.length === 2,
    )
    await act(async () => host.press("f5"))
    expect(runner.result).toBe(retained)
    expect(runner.resultIndex).toBe(1)
    await rename(join(a, "folder/request.yml"), join(a, "folder/renamed.yml"))
    await act(async () => app.onReloadCollection())
    await waitForHookState(render, () =>
      runner.requests.some((request) => request.id === "folder/renamed"),
    )
    await act(async () => host.press("f5"))
    await act(async () => host.press("return"))
    expect(modal.overlays.runnerDetail?.iteration).toBe(1)
    await act(async () => host.press("o"))
    expect(notification).toHaveBeenLastCalledWith(
      "Source unavailable: it may have been renamed or deleted",
      "warning",
    )
    expect(modal.overlays.runnerDetail).not.toBeNull()
    expect(runner.result).toBe(retained)
    await act(async () => {
      render!.resize(120, 30)
      await render!.flush()
    })
    expect(render.captureCharFrame()).toContain("Original request")
  } finally {
    if (render) await act(async () => render!.renderer.destroy())
    for (const spy of spies) spy.mockRestore()
    notification.mockRestore()
    cleanup()
    await rm(root, { recursive: true, force: true })
  }
})
