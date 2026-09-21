import { describe, expect, it, spyOn } from "bun:test"
import { act } from "react"
import { extend, useRenderer } from "@opentui/react"
import {
  CodeEditorRenderable,
  CodeEditorScrollBarRenderable,
} from "../../src/ui/editor/CodeEditor"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestRender } from "../testRender"
import { setupKeymap } from "./_helpers"
import {
  useResponse,
  type UseResponseResult,
} from "../../src/hooks/useResponse"
import {
  useCollectionRunner,
  type UseCollectionRunnerResult,
} from "../../src/hooks/useCollectionRunner"
import { ThemeProvider } from "../../src/ui/theme"
import { ResponseResults } from "../../src/ui/ResponseResults"
import { TimelineDetailOverlay } from "../../src/ui/overlays/TimelineDetailOverlay"
import { AppInner } from "../../src/ui/AppInner"
import { RendererProvider } from "../../src/ui/RendererContext"
import { bindingDefaults } from "../../src/ui/keybind"
import { buildTimelineEntry } from "../../src/timelineEntry"
import { lang } from "../../src/lang"
import { filestore } from "../../src/filestore"
import * as services from "../../src/app/services"
import type { Request, TimelineEntry } from "../../src/schema"

extend({
  "code-editor": CodeEditorRenderable,
  "code-editor-scrollbar": CodeEditorScrollBarRenderable,
})
const testRender = createTestRender()
const request = (url: string): Request => ({
  id: "manual",
  name: "Manual",
  method: "GET",
  url,
  headers: {},
  params: [],
  timeout: 0,
  scripts: { post: 'noodle.run.set("id", noodle.response.json().id);' },
  tests:
    'test("duplicate",()=>expect(noodle.run.get("id")).toBe(7)); test("duplicate",()=>{throw Error("callback failure")}); console.warn("test log");\nthrow Error("top-level failure");',
})

describe("rendered inline test parity", () => {
  it("runs manual sends, expands duplicate rows and group errors, and saves history diagnostics", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => Response.json({ id: 7 }),
    })
    const req = request(`http://127.0.0.1:${server.port}/`)
    const completed = Promise.withResolvers<void>()
    let manual: UseResponseResult
    let entry: TimelineEntry | undefined
    const { keymap, host } = setupKeymap()
    function Harness() {
      manual = useResponse(
        req,
        undefined,
        (sent, result, environment, secrets, prepared) => {
          entry = buildTimelineEntry(
            sent,
            result,
            undefined,
            environment,
            secrets,
            prepared,
          )
          completed.resolve()
        },
        undefined,
        undefined,
        { kind: "direct", source: "cli" },
      )
      return (
        <ResponseResults
          request={req}
          execution={
            manual.state.status === "done" ? manual.state.execution : undefined
          }
        />
      )
    }
    try {
      const render = await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <Harness />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 85, height: 30 },
      )
      await act(async () => manual!.trySend())
      await act(async () => completed.promise)
      await render.renderOnce()
      expect(manual!.state.status).toBe("done")
      let frame = render.captureCharFrame()
      expect(frame).toContain("Scripted tests")
      expect(frame).toContain("1 passed · 1 failed · script error")
      expect(frame.match(/duplicate/g)).toHaveLength(2)
      await act(async () => host.press("down"))
      await act(async () => host.press("return"))
      await render.renderOnce()
      frame = render.captureCharFrame()
      expect(frame).toContain("tests.js:2")
      expect(frame).toContain("test log")
      await act(async () => host.press("down"))
      await act(async () => host.press("down"))
      await act(async () => host.press("return"))
      await render.renderOnce()
      expect(render.captureCharFrame()).toContain("callback failure")
      expect(entry?.tests?.results.map((test) => test.passed)).toEqual([
        true,
        false,
      ])
      expect(entry?.request).not.toHaveProperty("tests")
    } finally {
      server.stop(true)
    }
  })
  it("runs the real Runner and exposes failure counts and expandable test results", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-tests-runner-"))
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => Response.json({ id: 7 }),
    })
    try {
      await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
      await writeFile(
        join(dir, "manual.yml"),
        lang.serializeRequest(request(`http://127.0.0.1:${server.port}/`)),
      )
      const collection = await filestore.loadCollection(dir)
      let runner: UseCollectionRunnerResult
      const { keymap, host } = setupKeymap()
      function Harness() {
        runner = useCollectionRunner({
          collection,
          collectionDir: dir,
          folderPath: null,
          activeEnvironment: null,
          environmentNames: [],
          hasUnsavedChanges: false,
          noProxy: true,
          systemProxy: { bypass: [] },
          insecure: false,
          resetKey: 0,
        })
        return runner.result?.results[0] ? (
          <ResponseResults execution={runner.result.results[0]} />
        ) : null
      }
      const render = await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <Harness />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 85, height: 30 },
      )
      await act(async () => runner!.run())
      await render.renderOnce()
      expect(runner!.phase).toBe("results")
      expect(runner!.result?.summary).toMatchObject({
        testPasses: 1,
        testFailures: 1,
        testScriptErrors: 1,
        failureCategories: ["test"],
      })
      expect(render.captureCharFrame()).toContain("Scripted tests")
      await act(async () => host.press("end"))
      await act(async () => host.press("return"))
      await render.renderOnce()
      expect(render.captureCharFrame()).toContain("callback failure")
    } finally {
      server.stop(true)
      await rm(dir, { recursive: true, force: true })
    }
  })
  it("renders historical tests in the existing Results tab", async () => {
    const { keymap, host } = setupKeymap()
    const entry = buildTimelineEntry(request("http://127.0.0.1/"), {
      status: "done",
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: "{}",
        timeMs: 0,
      },
      execution: {
        tests: {
          evaluated: true,
          results: [
            {
              name: "historical",
              passed: false,
              message: "historical failure",
              durationMs: 1,
            },
          ],
          logs: [{ level: "log", message: "historical log" }],
        },
      },
    })
    const render = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <TimelineDetailOverlay visible entry={entry} onClose={() => {}} />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 95, height: 30 },
    )
    await render.renderOnce()
    expect(render.captureCharFrame()).toContain("Results")
    // Request -> Response -> Results uses the overlay's existing tab navigation.
    await act(async () => host.press("right"))
    await act(async () => host.press("right"))
    await render.renderOnce()
    expect(render.captureCharFrame()).toContain("Scripted tests")
    await act(async () => host.press("end"))
    await act(async () => host.press("return"))
    await render.renderOnce()
    expect(render.captureCharFrame()).toContain("historical failure")
  })
  it("opens tests-only Runner details through AppInner and lays out Unicode names", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-tests-app-"))
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => Response.json({ id: 7 }),
    })
    const req = request(`http://127.0.0.1:${server.port}/`)
    delete req.scripts
    req.tests =
      'test("用户有效😀", () => expect(noodle.response.json().id).toBe(8))'
    const noop = () => {}
    const yes = () => true
    const loadCollection = filestore.loadCollection
    let loaded: Promise<unknown> = Promise.resolve()
    const loadSpy = spyOn(filestore, "loadCollection").mockImplementation(
      (...args) => {
        const pending = loadCollection(...args)
        loaded = pending
        return pending
      },
    )
    const runCollection = services.collectionRun
    let running: Promise<unknown> | undefined
    const runSpy = spyOn(services, "collectionRun").mockImplementation(
      (...args) => {
        const pending = runCollection(...args)
        running = pending
        return pending
      },
    )
    try {
      await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
      await writeFile(join(dir, "manual.yml"), lang.serializeRequest(req))
      const { keymap, host } = setupKeymap()
      function Harness() {
        const renderer = useRenderer()
        return (
          <RendererProvider renderer={renderer}>
            <AppInner
              appConfigDir={dir}
              collectionDir={dir}
              environmentsDir={join(dir, ".environments")}
              envNames={[]}
              envColors={{}}
              activeIndex={0}
              previewIndex={null}
              setPreviewIndex={noop}
              onThemeChange={noop}
              keybinds={bindingDefaults()}
              onKeybindChange={yes}
              settingsScope="global"
              globalSettingsCategory="appearance"
              collectionSettingsCategory="general"
              onSettingsScopeChange={noop}
              onGlobalSettingsCategoryChange={noop}
              onCollectionSettingsCategoryChange={noop}
              initialLayout="stacked"
              confirmUndoAll={false}
              onConfirmUndoAllChange={noop}
              externalEditors={[]}
              onExternalEditorChange={noop}
              onLayoutChange={yes}
              onEnvChange={noop}
              onEnvListChanged={async () => {}}
              appProxyCredentials={{}}
              collectionProxyCredentials={{}}
              tlsPassphrases={{}}
              cookiesEnabled={false}
              noProxy
              systemProxy={{ bypass: [] }}
              onAppProxyChange={yes}
              onCollectionProxyChange={yes}
              onAppProxyCredentialsChange={async () => true}
              onCollectionProxyCredentialsChange={async () => true}
              onProxyAuthDisable={async () => true}
              onTlsPassphraseChange={async () => true}
              onTlsProfileRemove={async () => true}
              onCollectionSettingsChange={yes}
              initialLastRequestId="manual"
              collectionPaths={[dir]}
              collectionSettingsByPath={{}}
              activeCollectionDir={dir}
              onCollectionsChange={yes}
              onRegisterCollection={() => null}
              onCollectionChange={noop}
              onReloadCollection={noop}
              onCollectionBootstrapped={noop}
              onCollectionImported={noop}
              mode="collection"
            />
          </RendererProvider>
        )
      }
      const render = await act(async () =>
        testRender(
          <KeymapProvider keymap={keymap}>
            <ThemeProvider activeIndex={0} previewIndex={null}>
              <Harness />
            </ThemeProvider>
          </KeymapProvider>,
          { width: 85, height: 30 },
        ),
      )
      await act(async () => loaded)
      await render.renderOnce()
      expect(render.captureCharFrame()).toContain("Manual")
      await act(async () => host.press("f5"))
      await render.renderOnce()
      expect(render.captureCharFrame()).toContain("Configure and run requests")
      await act(async () => host.press("r"))
      expect(running).toBeDefined()
      await act(async () => running)
      await act(async () =>
        render.waitForFrame((frame) => frame.includes("1 failed")),
      )
      await act(async () => host.press("return"))
      await render.renderOnce()
      expect(render.captureCharFrame()).toContain("Results")
      await act(async () => host.press("right"))
      await act(async () => host.press("right"))
      await render.renderOnce()
      const frame = render.captureCharFrame()
      expect(frame).toContain("Scripted tests")
      expect(frame).toContain("用户有效😀  ")
      await act(async () => host.press("end"))
      await act(async () => host.press("return"))
      await render.renderOnce()
      expect(render.captureCharFrame()).toContain(
        "Expected value to satisfy toBe",
      )
      await act(async () => render.renderer.destroy())
    } finally {
      loadSpy.mockRestore()
      runSpy.mockRestore()
      server.stop(true)
      await rm(dir, { recursive: true, force: true })
    }
  })
})
