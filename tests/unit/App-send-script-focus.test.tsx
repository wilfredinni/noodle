import { describe, expect, it, spyOn } from "bun:test"
import { act, type ComponentProps } from "react"
import { useRenderer } from "@opentui/react"
import { MouseButtons } from "@opentui/core/testing"
import { KeymapProvider } from "@opentui/keymap/react"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AppInner } from "../../src/ui/AppInner"
import { RendererProvider } from "../../src/ui/RendererContext"
import { ThemeProvider } from "../../src/ui/theme"
import { bindingDefaults } from "../../src/ui/keybind"
import { CodeEditorRenderable } from "../../src/ui/editor/CodeEditor"
import * as viewModule from "../../src/ui/MainView"
import { filestore } from "../../src/filestore"
import { executor } from "../../src/requests"
import * as responseHooks from "../../src/hooks/useResponse"
import { scriptText } from "../../src/scriptAuthoring"
import { createTestRender } from "../testRender"
import { setupKeymap } from "./_helpers"

const testRender = createTestRender()
const noop = () => {}
const yes = () => true

function Harness({ dir }: { dir: string }) {
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
        timelineMaxEntries={0}
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
        onCollectionScriptsChange={async () => true}
        initialLastRequestId="request"
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

describe("Send while editing request scripts", () => {
  it.each([
    ["pre", "d"],
    ["post", "f"],
    ["tests", "j"],
  ] as const)("keeps Send visible and clickable in %s", async (phase, jump) => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-send-script-"))
    const mainView = viewModule.MainView
    let view!: ComponentProps<typeof mainView>
    const viewSpy = spyOn(viewModule, "MainView").mockImplementation(
      (props) => {
        view = props
        return mainView(props)
      },
    )
    const send = spyOn(executor, "send").mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      body: "{}",
      timeMs: 1,
    })
    const { keymap, host } = setupKeymap()
    const loadCollection = filestore.loadCollection
    let loaded: Promise<unknown> = Promise.resolve()
    const loadSpy = spyOn(filestore, "loadCollection").mockImplementation(
      (...args) => {
        const pending = loadCollection(...args)
        loaded = pending
        return pending
      },
    )
    const completed = Promise.withResolvers<void>()
    const useResponse = responseHooks.useResponse
    const responseSpy = spyOn(responseHooks, "useResponse").mockImplementation(
      (request, env, onComplete, ...args) =>
        useResponse(
          request,
          env,
          (...result) => {
            onComplete?.(...result)
            completed.resolve()
          },
          ...args,
        ),
    )
    let h: Awaited<ReturnType<typeof testRender>> | undefined
    try {
      await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
      await filestore.saveRequest(dir, {
        id: "request",
        name: "Request",
        method: "GET",
        url: "https://example.com",
        headers: {},
        params: [],
        timeout: 0,
        scripts: { pre: "const original = 1", post: "const original = 1" },
        tests: "const original = 1",
      })
      h = await act(async () =>
        testRender(
          <KeymapProvider keymap={keymap}>
            <ThemeProvider activeIndex={0} previewIndex={null}>
              <Harness dir={dir} />
            </ThemeProvider>
          </KeymapProvider>,
          { width: 100, height: 30 },
        ),
      )
      await act(async () => loaded)
      await act(async () => host.press("g"))
      await act(async () => host.press(jump))
      await act(async () => h!.renderOnce())
      expect(
        h.renderer.root.findDescendantById("urlbar-send-button"),
      ).toBeDefined()
      await act(async () => host.press("down"))
      await act(async () => h!.renderOnce())
      const editor = h.renderer.root.findDescendantById(
        "script-source",
      ) as CodeEditorRenderable
      expect(h.renderer.currentFocusedRenderable).toBe(editor)
      expect(view.eb.editState.mode).toBe("editing")
      expect(
        h.renderer.root.findDescendantById("urlbar-send-button"),
      ).toBeDefined()

      const edited = 'console.info("edited script")'
      await act(async () => editor.replaceText(edited))
      await act(async () => h!.resize(60, 24))
      await act(async () => h!.renderOnce())
      const button = h.renderer.root.findDescendantById("urlbar-send-button")!
      expect(button.x + button.width).toBeLessThanOrEqual(60)
      expect(h.captureCharFrame()).toContain("Send")
      await act(async () =>
        h!.mockMouse.click(button.x + 1, button.y, MouseButtons.LEFT),
      )
      await act(async () => completed.promise)
      expect(view.responseState.status).toBe("done")
      if (view.responseState.status === "done") {
        const execution = view.responseState.execution
        const logs =
          phase === "tests"
            ? execution?.tests?.logs
            : execution?.scripts?.results.find(
                (result) => result.phase === phase,
              )?.logs
        expect(logs?.map((log) => log.message)).toContain("edited script")
      }
      expect(send).toHaveBeenCalledTimes(1)
      expect(scriptText(view.draft.draft!, phase)).toBe(edited)
      expect(view.focus).toBe("request")
    } finally {
      if (h) await act(async () => h!.renderer.destroy())
      viewSpy.mockRestore()
      send.mockRestore()
      loadSpy.mockRestore()
      responseSpy.mockRestore()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
