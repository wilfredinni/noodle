import { createScriptDiagnostics } from "../../src/ui/editor/scriptDiagnostics"
import { afterEach, describe, expect, it, spyOn } from "bun:test"
import { act, useState } from "react"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestRender } from "../testRender"
import { setupKeymap } from "./_helpers"
import { ThemeProvider } from "../../src/ui/theme"
import { RequestPane } from "../../src/ui/RequestPane"
import { ScriptAuthoringContext } from "../../src/ui/editor/ScriptEditor"
import {
  ScriptOrderOverlay,
  type ScriptOrder,
} from "../../src/ui/overlays/ScriptOrderOverlay"
import { CollectionScripts } from "../../src/ui/settings/CollectionScripts"
import {
  queueCollectionSettingsSave,
  type CollectionSettingsPersistence,
} from "../../src/ui/settings/settingsPersistence"
import { CodeEditorRenderable } from "../../src/ui/editor/CodeEditor"
import {
  useRequestDraft,
  type UseRequestDraftResult,
} from "../../src/hooks/useRequestDraft"
import {
  useFolderDraft,
  type UseFolderDraftResult,
} from "../../src/hooks/useFolderDraft"
import {
  useFolderEditBrowse,
  type UseFolderEditBrowseResult,
} from "../../src/hooks/useFolderEditBrowse"
import {
  useEditBrowse,
  type UseEditBrowseResult,
} from "../../src/hooks/useEditBrowse"
import {
  useResponse,
  type UseResponseResult,
} from "../../src/hooks/useResponse"
import {
  useCollectionRunner,
  type UseCollectionRunnerResult,
} from "../../src/hooks/useCollectionRunner"
import {
  filestore,
  saveFolder,
  loadSettings,
  saveSettings,
} from "../../src/filestore"
import { executor } from "../../src/requests"
import type {
  Collection,
  CollectionSettings,
  Folder,
  Request,
} from "../../src/schema"
import type { FieldKind } from "../../src/ui/editMode"
import type { PrepareScriptFields } from "../../src/ui/editor/codeFormatting"
import {
  CodeFormattingContext,
  type FormattingTarget,
} from "../../src/ui/editor/CodeFormattingContext"

const testRender = createTestRender()
const directories: string[] = []
const formatServices: ReturnType<typeof createScriptDiagnostics>[] = []
afterEach(async () => {
  for (const service of formatServices.splice(0)) service.dispose()
  for (const dir of directories.splice(0))
    await rm(dir, { recursive: true, force: true })
})
const request: Request = {
  id: "a",
  name: "A",
  url: "https://example.com",
  method: "GET",
  headers: {},
  params: [],
  timeout: 0,
}
const folder: Folder = {
  id: "users",
  name: "Users",
  path: "users",
  children: [],
  scripts: { pre: 'console.info("folder")' },
}
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "noodle-script-workspace-"))
  directories.push(dir)
  return dir
}

describe("script workspaces", () => {
  it("prepares collection formatting without changing the editor until the save succeeds", async () => {
    const { keymap, host } = setupKeymap()
    const diagnostics = createScriptDiagnostics()
    formatServices.push(diagnostics)
    const target = { current: null as FormattingTarget | null }
    let prepare!: PrepareScriptFields
    let fields!: Parameters<PrepareScriptFields>[0]
    const h = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <CodeFormattingContext.Provider value={target}>
            <ScriptAuthoringContext.Provider
              value={{
                collectionDir: ".",
                collection: null,
                diagnostics,
                formatOnSave: true,
                confirm: (run) => run(),
                setActive: () => {},
              }}
            >
              <CollectionScripts
                fields={{}}
                focused
                onFocus={() => {}}
                onEditingChange={() => {}}
                onChange={async (snapshot, formatter) => {
                  fields = snapshot
                  prepare = formatter!
                  return false
                }}
              />
            </ScriptAuthoringContext.Provider>
          </CodeFormattingContext.Provider>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 23 },
    )
    await act(async () => host.press("down"))
    const editor = h.renderer.root.findDescendantById(
      "script-source",
    ) as CodeEditorRenderable
    const source = "const x={a:1}"
    await act(async () => editor.insertText(source))
    await act(async () => host.press("escape"))
    const prepared = await act(async () => prepare(fields))
    expect(prepared.fields.scripts?.pre).toBe("const x = { a: 1 }")
    expect(editor.plainText).toBe(source)
    await act(async () => host.press("down"))
    await act(async () => prepared.apply?.())
    expect(editor.plainText).toBe("const x = { a: 1 }")
    await act(async () => editor.undo())
    expect(editor.plainText).toBe(source)
    await act(async () => editor.replaceText("const newer=2"))
    await act(async () => prepared.apply?.())
    expect(editor.plainText).toBe("const newer=2")
  })

  it.each([
    ["pre", "preScript"],
    ["post", "postScript"],
    ["tests", "tests"],
  ] as const)(
    "tracks and reverts %s edits without losing changes made during a save",
    async (phase, field) => {
      const original: Request = {
        ...request,
        scripts: { pre: "before()", post: "after()" },
        tests: "checks()",
      }
      let draft!: UseRequestDraftResult
      let browse!: UseEditBrowseResult
      let select!: (request: Request) => void
      function Harness() {
        const [selected, setSelected] = useState(original)
        select = setSelected
        draft = useRequestDraft(selected)
        browse = useEditBrowse(draft.draft, draft)
        return null
      }
      await testRender(<Harness />, { width: 20, height: 4 })
      await act(async () => draft.setScript(phase, "changed()"))
      expect(draft.isDirty).toBe(true)
      expect(draft.dirtyRequestIds.has(request.id)).toBe(true)
      await act(async () => browse.enterBrowseAt(field, 0))
      await act(async () => browse.revertField())
      expect(draft.draft).toEqual(original)
      expect(draft.isDirty).toBe(false)
      expect(draft.dirtyRequestIds.size).toBe(0)
      await act(async () => draft.setScript(phase, "saving()"))
      const saving = draft.draft!
      await act(async () => draft.setScript(phase, "newer()"))
      await act(async () => {
        draft.markSaved(saving)
        select(saving)
      })
      expect(
        phase === "tests" ? draft.draft?.tests : draft.draft?.scripts?.[phase],
      ).toBe("newer()")
      expect(draft.isDirty).toBe(true)
      await act(async () => {
        const saved = draft.draft!
        draft.markSaved(saved)
        select(saved)
      })
      expect(draft.isDirty).toBe(false)
    },
  )

  it("reveals optional script tabs, preserves per-request drafts, and saves through the existing YAML path", async () => {
    const dir = await fixture()
    const { keymap } = setupKeymap()
    let select!: (request: Request) => void
    let draft!: UseRequestDraftResult
    let browse!: UseEditBrowseResult
    let folderDraft!: UseFolderDraftResult
    let folderBrowse!: UseFolderEditBrowseResult
    let tab!: FieldKind
    function Harness() {
      const [selected, setSelected] = useState(request)
      const [active, setActive] = useState<FieldKind>("headers")
      select = setSelected
      tab = active
      draft = useRequestDraft(selected)
      folderDraft = useFolderDraft(folder)
      folderBrowse = useFolderEditBrowse(folderDraft.folderDraft, folderDraft)
      browse = useEditBrowse(draft.draft, draft, {
        initialTab: active,
        onTabChange: setActive,
      })
      return (
        <RequestPane
          request={draft.draft}
          activeTab={active}
          focused
          editState={browse.editState}
          editKey={browse.editKey}
          editValue={browse.editValue}
          setEditKey={browse.setEditKey}
          setEditValue={browse.setEditValue}
          onTabChange={setActive}
          onOptionalTabReveal={browse.revealOptionalTab}
          revealedOptionalTabs={browse.revealedOptionalTabs}
        />
      )
    }
    const h = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 120, height: 15 },
    )
    await act(async () => {
      await h.renderOnce()
    })
    expect(h.renderer.root.findDescendantById("tab-preScript")).toBeUndefined()
    for (const field of ["preScript", "postScript", "tests"] as const) {
      await act(async () => {
        browse.revealOptionalTab(field)
        browse.enterBrowseAt(field)
      })
      await act(async () => {
        await h.renderOnce()
      })
      expect(h.renderer.root.findDescendantById(`tab-${field}`)).toBeDefined()
    }
    expect(tab).toBe("tests")
    await act(async () => {
      draft.setScript("pre", 'console.info("request")')
      draft.setScript("tests", 'test("ok", () => expect(1).toBe(1))')
    })
    expect(draft.isDirty).toBe(true)
    expect(draft.dirtyRequestIds.has(request.id)).toBe(true)
    await act(async () =>
      select({ ...request, id: "b", scripts: { post: "./post.js" } }),
    )
    expect(draft.draft?.scripts).toEqual({ post: "./post.js" })
    await act(async () => select(request))
    expect(draft.draft?.scripts?.pre).toBe('console.info("request")')
    const saved = draft.draft!
    await act(async () => {
      await filestore.saveRequest(dir, saved)
      draft.markSaved(saved)
      select(saved)
    })
    expect(draft.isDirty).toBe(false)
    expect(await readFile(join(dir, "a.yml"), "utf8")).toContain("scripts:")
    await act(async () =>
      folderDraft.setScript("tests", 'test("folder", () => expect(1).toBe(1))'),
    )
    expect(folderDraft.folderDraft?.tests).toContain("folder")
    expect(folderDraft.isDirty).toBe(true)
    await act(async () => {
      folderBrowse.enterBrowseAt("preScript", 0)
      folderDraft.setScript("pre", "changed()")
    })
    await act(async () => folderBrowse.revertField())
    expect(folderDraft.folderDraft?.scripts?.pre).toBe(folder.scripts?.pre)
    await act(async () => {
      await saveFolder(dir, folderDraft.folderDraft!)
    })
    expect(await readFile(join(dir, "users/folder.yml"), "utf8")).toContain(
      "tests:",
    )
  })

  it.each([
    ["headers", undefined],
    ["params", undefined],
    ["pathParams", undefined],
    ["body", undefined],
    ["auth", undefined],
    ["assertions", undefined],
    ["captures", undefined],
    ["settings", undefined],
    ["preScript", "pre"],
    ["postScript", "post"],
    ["tests", "tests"],
  ] as const)(
    "shows only the relevant inheritance on the %s tab",
    async (tab, phase) => {
      const child = {
        ...request,
        id: "users/a",
        scripts: { pre: "own()", post: "after()" },
        tests: "check()",
      }
      const collection: Collection = {
        id: "demo",
        name: "Demo",
        scripts: { pre: "./pre.js", post: "./post.js" },
        tests: "./tests.js",
        items: [
          {
            type: "folder",
            data: {
              ...folder,
              scripts: { pre: "before()", post: "after()" },
              children: [{ type: "request", data: child }],
            },
          },
        ],
      }
      const { keymap } = setupKeymap()
      let activeOrder: ScriptOrder | null = null
      let showOrder!: () => void
      let setTabMenu!: (active: boolean) => void
      const setActiveOrder = (order: ScriptOrder | null) => {
        activeOrder = order
      }
      function OrderHarness() {
        const [menuActive, setMenuActive] = useState(false)
        setTabMenu = setMenuActive
        const [order, setOrder] = useState<ScriptOrder | null>(null)
        showOrder = () => setOrder(activeOrder)
        return (
          <ScriptAuthoringContext.Provider
            value={{
              collection,
              collectionDir: "/tmp",
              confirm: () => {},
              setActive: () => {},
              setActiveOrder,
              showOrder: setOrder,
            }}
          >
            <RequestPane
              request={child}
              focused
              tabMenuActive={menuActive}
              onTabMenuActiveChange={setMenuActive}
              activeTab={tab}
              editState={{
                mode: "inactive",
                cursor: { field: "headers", row: -1, addingRow: true },
                editingRow: -1,
              }}
              editKey=""
              editValue=""
              setEditKey={() => {}}
              setEditValue={() => {}}
            />
            {order && (
              <ScriptOrderOverlay
                order={order}
                onClose={() => setOrder(null)}
              />
            )}
          </ScriptAuthoringContext.Provider>
        )
      }
      const h = await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <OrderHarness />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 120, height: 30 },
      )
      await act(async () => {
        await h.renderOnce()
      })
      let frame = h.captureCharFrame()
      if (!phase) {
        expect(frame).not.toContain("run in this order")
        return
      }
      expect(frame).not.toContain("Execution order")
      expect(frame).not.toContain("Collection: Demo")
      expect(activeOrder).not.toBeNull()
      await act(async () => setTabMenu(true))
      expect(activeOrder).toBeNull()
      await act(async () => setTabMenu(false))
      expect(activeOrder).not.toBeNull()
      await act(async () => showOrder())
      await act(async () => {
        await h.renderOnce()
      })
      frame = h.captureCharFrame()
      const ordered =
        phase === "tests"
          ? ["1  Collection: Demo", "2  This request"]
          : ["1  Collection: Demo", "2  Folder: users", "3  This request"]
      let previous = -1
      for (const label of ordered) {
        expect(frame).toContain(label)
        expect(frame.indexOf(label)).toBeGreaterThan(previous)
        previous = frame.indexOf(label)
      }
      expect(frame).toContain("run in this order")
      expect(frame).not.toContain("Reference only")
      expect(frame).not.toContain("This request runs")
      expect(frame).toContain(`./${phase}.js`)
      for (const other of ["pre", "post", "tests"]) {
        if (other !== phase) expect(frame).not.toContain(`./${other}.js`)
      }
    },
  )

  it.each([false, true])(
    "edits all collection phases with format on save %s without overwriting unrelated settings",
    async (formatOnSave) => {
      const dir = await fixture()
      await saveSettings(dir, { name: "Original", cookies: { enabled: false } })
      const initial = await loadSettings(dir)
      const persistence: CollectionSettingsPersistence = {
        activeCollectionDir: { current: dir },
        currentSettings: { current: initial },
        persistedSettings: { current: initial },
        saveChain: { current: Promise.resolve() },
        pendingUpdates: { current: [] },
      }
      const { keymap, host } = setupKeymap()
      const patches: unknown[] = []
      const diagnostics = createScriptDiagnostics()
      formatServices.push(diagnostics)
      function Harness() {
        const [fields, setFields] = useState<CollectionSettings>(initial)
        return (
          <CollectionScripts
            fields={fields}
            focused
            onFocus={() => {}}
            onEditingChange={() => {}}
            onChange={(patch, prepare) => {
              patches.push(patch)
              return queueCollectionSettingsSave(
                persistence,
                dir,
                (settings) => ({ ...settings, ...patch }),
                async (dir, fields) => {
                  const prepared = await prepare?.(patch)
                  const next = prepared
                    ? { ...fields, ...prepared.fields }
                    : fields
                  await saveSettings(dir, next)
                  prepared?.apply?.()
                  return next
                },
                setFields,
                () => {},
              ).then(
                () => true,
                () => false,
              )
            }}
          />
        )
      }
      const h = await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <ScriptAuthoringContext.Provider
              value={{
                collectionDir: dir,
                collection: null,
                diagnostics,
                formatOnSave,
                confirm: (run) => run(),
                setActive: () => {},
              }}
            >
              <Harness />
            </ScriptAuthoringContext.Provider>
          </ThemeProvider>
        </KeymapProvider>,
        { width: 90, height: 23 },
      )
      for (const phase of ["pre", "post", "tests"] as const) {
        await act(async () => host.press("down"))
        const editor = h.renderer.root.findDescendantById(
          "script-source",
        ) as CodeEditorRenderable
        await act(async () => {
          editor.insertText('const x={a:1};console.info("')
          editor.insertText(`${phase}")`)
        })
        await act(async () => host.press("escape"))
        await act(async () => {
          await persistence.saveChain.current
        })
        await act(async () => host.press("right"))
      }
      const saved = await loadSettings(dir)
      expect(saved.scripts).toEqual({
        pre: formatOnSave
          ? 'const x = { a: 1 }; console.info("pre")'
          : 'const x={a:1};console.info("pre")',
        post: formatOnSave
          ? 'const x = { a: 1 }; console.info("post")'
          : 'const x={a:1};console.info("post")',
      })
      expect(saved.tests).toBe(
        formatOnSave
          ? 'const x = { a: 1 }; console.info("tests")'
          : 'const x={a:1};console.info("tests")',
      )
      expect(saved.name).toBe("Original")
      expect(patches).toHaveLength(3)
      expect(
        patches.every((patch) => !Object.hasOwn(patch as object, "name")),
      ).toBe(true)
    },
  )

  it("manual sends and the Runner preflight every applicable source before HTTP", async () => {
    const dir = await fixture()
    await saveSettings(dir, { cookies: { enabled: false } })
    await filestore.saveRequest(dir, request)
    await filestore.saveRequest(dir, {
      ...request,
      id: "b",
      tests: "./broken.js",
    })
    await writeFile(join(dir, "broken.js"), "const broken = ;")
    const collection = await filestore.loadCollection(dir)
    const send = spyOn(executor, "send").mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      body: "{}",
      timeMs: 1,
    })
    let manual!: UseResponseResult
    let runner!: UseCollectionRunnerResult
    const complete = Promise.withResolvers<void>()
    function Harness() {
      manual = useResponse(
        { ...request, scripts: { post: "./broken.js" } },
        undefined,
        () => complete.resolve(),
        collection,
        request.id,
        undefined,
        undefined,
        undefined,
        dir,
      )
      runner = useCollectionRunner({
        collection,
        collectionDir: dir,
        activeEnvironment: null,
        environmentNames: [],
        hasUnsavedChanges: false,
        noProxy: true,
        folderPath: null,
        systemProxy: { bypass: [] },
        insecure: false,
        resetKey: 1,
      })
      return null
    }
    try {
      await testRender(<Harness />, { width: 20, height: 5 })
      await act(async () => manual.trySend())
      await act(async () => {
        await complete.promise
      })
      expect(manual.state.status).toBe("error")
      await act(async () => {
        await runner.run()
      })
      expect(JSON.stringify(runner.result)).toContain("SyntaxError")
      expect(send).not.toHaveBeenCalled()
    } finally {
      send.mockRestore()
    }
  })
})
