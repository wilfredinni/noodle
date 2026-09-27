import { useRenderer } from "@opentui/react"
import { KeymapProvider } from "@opentui/keymap/react"
import { AppInner } from "../../src/ui/AppInner"
import { RendererProvider } from "../../src/ui/RendererContext"
import { ThemeProvider } from "../../src/ui/theme"
import { bindingDefaults } from "../../src/ui/keybind"
import { setupKeymap } from "./_helpers"
import { filestore, saveFolder } from "../../src/filestore"
import * as viewModule from "../../src/ui/MainView"
import * as saveModule from "../../src/ui/useSaveFile"
import * as actionsModule from "../../src/ui/useCollectionFileActions"
import * as filestoreModule from "../../src/filestore"
import { CodeEditorRenderable } from "../../src/ui/editor/CodeEditor"
import { afterEach, describe, expect, it, spyOn } from "bun:test"
import { act, type ComponentProps } from "react"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createTestRender } from "../testRender"
import { useSaveFile, type UseSaveFileResult } from "../../src/ui/useSaveFile"
import { createScriptDiagnostics } from "../../src/ui/editor/scriptDiagnostics"
import { formatCodeFields } from "../../src/ui/editor/codeFormatting"
import { parseRequest } from "../../src/lang/parse"
import type { Request } from "../../src/schema"

const testRender = createTestRender()
const directories: string[] = []
const services: ReturnType<typeof createScriptDiagnostics>[] = []
afterEach(async () => {
  for (const service of services.splice(0)) service.dispose()
  for (const dir of directories.splice(0))
    await rm(dir, { recursive: true, force: true })
})

describe("format on save", () => {
  it.each(["disabled", "enabled", "unavailable"])(
    "saves request bodies and inline scripts with formatting %s",
    async (mode) => {
      const enabled = mode !== "disabled"
      const dir = await mkdtemp(join(tmpdir(), "noodle-format-save-"))
      directories.push(dir)
      const service = createScriptDiagnostics()
      services.push(service)
      const formatter = {
        format:
          mode === "unavailable"
            ? async () => {
                throw new Error("Semantic validation unavailable")
              }
            : service.format,
      }
      const request: Request = {
        id: "request",
        name: "Request",
        method: "POST",
        url: "https://example.com",
        headers: {},
        params: [],
        timeout: 0,
        bodyType: "json",
        body: '{"n":90071992547409931234,"v":$VALUE}',
        scripts: { pre: "const x={a:1}", post: "./scripts/post.js" },
        tests: "test(",
      }
      let save!: UseSaveFileResult
      let saved: Request | undefined
      function Harness() {
        save = useSaveFile(
          dir,
          request,
          request.id,
          (value) => {
            saved = value
          },
          enabled ? (value) => formatCodeFields(value, formatter) : undefined,
        )
        return null
      }
      await testRender(<Harness />, { width: 60, height: 12 })
      await act(async () => {
        await save.doSave()
      })
      expect(save.saveState.kind).toBe("success")
      const disk = parseRequest(
        "request",
        await readFile(join(dir, "request.yml"), "utf8"),
      )
      expect(disk.body).toBe(
        enabled
          ? '{\n  "n": 90071992547409931234,\n  "v": $VALUE\n}'
          : request.body,
      )
      expect(disk.scripts?.pre).toBe(
        mode === "enabled" ? "const x = { a: 1 }" : request.scripts?.pre,
      )
      expect(disk.scripts?.post).toBe("./scripts/post.js")
      expect(disk.tests).toBe("test(")
      expect(saved?.body).toBe(disk.body)
      save.clearSaveTimer()
    },
  )
})

it.each(["request", "folder"] as const)(
  "applies %s formatting only after a successful save and preserves newer edits",
  async (kind) => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-format-failure-"))
    directories.push(dir)
    const request: Request = {
      id: "api/request",
      name: "Request",
      method: "POST",
      url: "https://example.com",
      headers: {},
      params: [],
      timeout: 0,
      bodyType: "json",
      body: '{"value":1}',
    }
    await mkdir(join(dir, "api"))
    await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
    await saveFolder(dir, { id: "api", name: "API", path: "api", children: [] })
    await filestore.saveRequest(dir, request)
    const mainView = viewModule.MainView
    let view!: ComponentProps<typeof mainView>
    const viewSpy = spyOn(viewModule, "MainView").mockImplementation(
      (props) => {
        view = props
        return mainView(props)
      },
    )
    const useSave = saveModule.useSaveFile
    let save!: UseSaveFileResult
    const saveSpy = spyOn(saveModule, "useSaveFile").mockImplementation(
      (...args) => {
        save = useSave(...args)
        return save
      },
    )
    const useActions = actionsModule.useCollectionFileActions
    let actions!: ReturnType<typeof useActions>
    const actionsSpy = spyOn(
      actionsModule,
      "useCollectionFileActions",
    ).mockImplementation((args) => {
      actions = useActions(args)
      return actions
    })
    const load = filestore.loadCollection
    let loaded: Promise<unknown> = Promise.resolve()
    const loadSpy = spyOn(filestore, "loadCollection").mockImplementation(
      (...args) => {
        loaded = load(...args)
        return loaded as ReturnType<typeof load>
      },
    )
    const noop = () => {}
    const yes = () => true
    const { keymap } = setupKeymap()
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
            formatOnSave
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
            onCollectionScriptsChange={async () => true}
            initialLastRequestId="api/request"
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
    try {
      const h = await act(async () =>
        testRender(
          <KeymapProvider keymap={keymap}>
            <ThemeProvider activeIndex={0} previewIndex={null}>
              <Harness />
            </ThemeProvider>
          </KeymapProvider>,
          { width: 100, height: 30 },
        ),
      )
      await act(async () => loaded)
      if (kind === "folder") await act(async () => view.onFolderSelect?.("api"))
      await act(async () => {
        if (kind === "request") view.draft.setBody('{"value":2}')
        else view.folderDraft.setScript("pre", "const x={a:1}")
      })
      await act(async () => {
        view.onPaneFocus?.(kind)
        if (kind === "request") view.eb.enterBrowseAt("body", 0)
        else view.folderEb.activateAt("preScript", 0)
      })
      if (kind === "request")
        await act(async () => view.eb.enterTextBodyEditor())
      const editor = h.renderer.root.findDescendantById(
        kind === "request" ? "request-body-editor" : "script-source",
      ) as CodeEditorRenderable
      const source = editor.plainText
      const before =
        kind === "request" ? view.draft.draft : view.folderDraft.folderDraft
      const path =
        kind === "request"
          ? join(dir, "api", "request.yml")
          : join(dir, "api", "folder.yml")
      await rm(path)
      await mkdir(path)
      await act(async () => {
        if (kind === "request") await save.doSave()
        else await actions.handleFolderSave()
      })
      expect(save.saveState.kind).toBe("error")
      expect(
        kind === "request" ? view.draft.draft : view.folderDraft.folderDraft,
      ).toEqual(before)
      expect(
        kind === "request" ? view.draft.isDirty : view.folderDraft.isDirty,
      ).toBe(true)
      expect(editor.plainText).toBe(source)

      await rm(path, { recursive: true })
      await act(async () => {
        if (kind === "request") await save.doSave()
        else await actions.handleFolderSave()
      })
      expect(save.saveState.kind).toBe("success")
      expect(editor.plainText).toBe(
        kind === "request" ? '{\n  "value": 2\n}' : "const x = { a: 1 }",
      )
      expect(
        kind === "request" ? view.draft.isDirty : view.folderDraft.isDirty,
      ).toBe(false)
      await act(async () => editor.undo())
      expect(editor.plainText).toBe(source)

      const started = Promise.withResolvers<void>()
      const release = Promise.withResolvers<void>()
      const writeRequest = filestore.saveRequest
      const writeFolder = filestoreModule.saveFolder
      const writer =
        kind === "request"
          ? spyOn(filestore, "saveRequest").mockImplementation(
              async (...args) => {
                started.resolve()
                await release.promise
                return writeRequest(...args)
              },
            )
          : spyOn(filestoreModule, "saveFolder").mockImplementation(
              async (...args) => {
                started.resolve()
                await release.promise
                return writeFolder(...args)
              },
            )
      let saving: Promise<void> | undefined
      try {
        await act(async () => {
          saving =
            kind === "request" ? save.doSave() : actions.handleFolderSave()
          await started.promise
        })
        const newer = kind === "request" ? '{"value":3}' : "const x={a:2}"
        await act(async () => editor.replaceText(newer))
        await act(async () => {
          release.resolve()
          await saving
        })
        expect(editor.plainText).toBe(newer)
        expect(
          kind === "request"
            ? view.draft.draft?.body
            : view.folderDraft.folderDraft?.scripts?.pre,
        ).toBe(newer)
        expect(
          kind === "request" ? view.draft.isDirty : view.folderDraft.isDirty,
        ).toBe(true)
      } finally {
        release.resolve()
        await act(async () => saving)
        writer.mockRestore()
      }
      save.clearSaveTimer()
    } finally {
      viewSpy.mockRestore()
      saveSpy.mockRestore()
      actionsSpy.mockRestore()
      loadSpy.mockRestore()
    }
  },
)
