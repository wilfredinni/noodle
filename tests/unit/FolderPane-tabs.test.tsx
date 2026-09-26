import { expect, it } from "bun:test"
import { act, useEffect, useRef, useState } from "react"
import { KeymapProvider, useBindings } from "@opentui/keymap/react"
import { createTestRender } from "../testRender"
import { setupKeymap } from "./_helpers"
import { ThemeProvider } from "../../src/ui/theme"
import { THEMES } from "../../src/ui/theme-data"
import { FolderPane } from "../../src/ui/FolderPane"
import { useFolderDraft } from "../../src/hooks/useFolderDraft"
import { useFolderEditBrowse } from "../../src/hooks/useFolderEditBrowse"
import { createFolderLayers } from "../../src/ui/keymap/folderLayers"
import type { AppKeymapContext } from "../../src/ui/keymap/types"
import { bindingDefaults } from "../../src/ui/keybind"
import { useEditModeSync } from "../../src/ui/useEditModeSync"
import type { Folder } from "../../src/schema"

const testRender = createTestRender()
const empty: Folder = { id: "api", path: "api", name: "API", children: [] }

async function mount(initialFolder = empty, interactive = true) {
  const { keymap, host } = setupKeymap()
  let editor!: ReturnType<typeof useFolderEditBrowse>
  let draft!: ReturnType<typeof useFolderDraft>
  let switchFolder!: (folder: Folder) => void
  function Harness() {
    const [folder, setFolder] = useState(initialFolder)
    switchFolder = setFolder
    draft = useFolderDraft(folder)
    editor = useFolderEditBrowse(draft.folderDraft, draft, {
      optionalTabMenuEnabled: interactive,
    })
    const ref = useRef(editor)
    ref.current = editor
    const layers = createFolderLayers({
      keymap,
      keybinds: bindingDefaults(),
      global: {
        modeRef: { current: interactive ? "collection" : "browse" },
        setFocus: () => {},
      },
      folder: { folderEbRef: ref },
      request: {},
      actions: {},
    } as unknown as AppKeymapContext)
    useBindings(() => layers[0], [editor])
    useBindings(() => layers[2], [editor])
    useEditModeSync({
      focus: "folder",
      view: "main",
      folderEb: editor,
      eb: { editState: { mode: "inactive" } },
      envEditor: { editState: { mode: "inactive" } },
    } as Parameters<typeof useEditModeSync>[0])
    useEffect(() => {
      keymap.setData("app.focus", "folder")
      keymap.setData("app.view", "main")
    }, [])
    return (
      <FolderPane
        collectionDir="/tmp/collection"
        folder={draft.folderDraft}
        focused
        editState={editor.editState}
        editKey={editor.editKey}
        editValue={editor.editValue}
        setEditKey={editor.setEditKey}
        setEditValue={editor.setEditValue}
        activeTab={editor.activeTab}
        revealedOptionalTabs={editor.revealedOptionalTabs}
        tabMenuActive={editor.optionalTabMenuActive}
        onTabMenuActiveChange={editor.setOptionalTabMenuActive}
        onOptionalTabReveal={editor.revealOptionalTab}
        onTabChange={editor.enterBrowseAt}
        onInteraction={editor.commitEdit}
        onScriptChange={draft.setScript}
        onScriptExit={editor.commitEdit}
        onAuthTypeChange={draft.setAuthType}
        onApiKeyPlacementChange={draft.setApiKeyPlacement}
        activeEnv={null}
        theme={THEMES[0]!}
        interactive={interactive}
      />
    )
  }
  const render = await testRender(
    <KeymapProvider keymap={keymap}>
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness />
      </ThemeProvider>
    </KeymapProvider>,
    { width: 100, height: 20 },
  )
  const settle = () =>
    act(async () => {
      await render.renderOnce()
    })
  await settle()
  const press = async (key: string) => {
    await act(() => {
      host.press(key)
    })
    await settle()
  }
  const click = async (id: string) => {
    const node = render.renderer.root.findDescendantById(id)!
    expect(node).toBeDefined()
    await act(async () => {
      await render.mockMouse.click(node.x + 1, node.y)
    })
    await settle()
  }
  return {
    ...render,
    settle,
    press,
    pressBatch: async (keys: string[]) => {
      await act(() => {
        for (const key of keys) host.press(key)
      })
      await settle()
    },
    click,
    keymap,
    editor: () => editor,
    draft: () => draft,
    switchFolder: async (folder: Folder) => {
      await act(() => {
        switchFolder(folder)
      })
      await settle()
    },
    tab: (field: string) =>
      render.renderer.root.findDescendantById(`tab-${field}`),
  }
}

it("reveals folder script tabs with the request-style menu and skips already visible items", async () => {
  const h = await mount()
  for (const field of ["preScript", "postScript", "tests"])
    expect(h.tab(field)).toBeUndefined()
  expect(h.captureCharFrame()).toContain("+")
  expect(h.captureCharFrame()).not.toContain("▼")
  await h.click("folder-tab-add")
  expect(h.captureCharFrame()).toContain("Pre Script")
  await h.press("return")
  expect(h.editor().activeTab).toBe("preScript")
  await act(() => {
    h.draft().setScript("pre", "console.log(1)")
  })
  await h.settle()
  expect(h.captureCharFrame()).toContain("Pre Script •")
  await act(() => {
    h.draft().setScript("pre", "")
  })
  await h.settle()
  await h.click("tab-meta")
  expect(h.tab("preScript")).toBeDefined()
  expect(h.tab("postScript")).toBeUndefined()

  await h.click("folder-tab-add")
  expect(h.captureCharFrame().match(/Pre Script/g)).toHaveLength(2)
  await h.press("return")
  expect(h.editor().activeTab).toBe("postScript")
  await h.click("folder-tab-add")
  await h.press("return")
  expect(h.editor().activeTab).toBe("tests")
  await h.click("folder-tab-add")
  await h.press("return")
  expect(h.editor().activeTab).toBe("tests")
  await h.press("escape")

  await h.switchFolder({ ...empty, id: "other", path: "other" })
  expect(h.editor().activeTab).toBe("meta")
  for (const field of ["preScript", "postScript", "tests"])
    expect(h.tab(field)).toBeUndefined()
  await h.switchFolder(empty)
  for (const field of ["preScript", "postScript", "tests"])
    expect(h.tab(field)).toBeDefined()
})

it("cycles past hidden tabs and reaches + with the keyboard in a narrow folder pane", async () => {
  const h = await mount()
  await h.press("right")
  await h.press("right")
  expect(h.editor().activeTab).toBe("auth")
  await h.press("right")
  expect(h.editor().activeTab).toBe("activity")
  await h.press("right")
  expect(h.editor().optionalTabMenuActive).toBe(true)
  await h.press("right")
  expect(h.editor().activeTab).toBe("meta")
  await h.press("left")
  expect(h.editor().optionalTabMenuActive).toBe(true)
  await act(() => {
    h.resize(35, 14)
  })
  await h.settle()
  const add = h.renderer.root.findDescendantById("folder-tab-add")!
  expect(add.x).toBeGreaterThan(0)
  expect(add.x + add.width).toBeLessThanOrEqual(35)
  await h.press("return")
  expect(h.captureCharFrame()).toContain("Pre Script")
  await h.press("down")
  await h.press("return")
  expect(h.editor().activeTab).toBe("postScript")
  expect(h.tab("postScript")).toBeDefined()
  await h.press("left")
  expect(h.editor().activeTab).toBe("auth")
  await h.press("right")
  expect(h.editor().activeTab).toBe("postScript")
})

it("preserves buffered arrow steps through the folder tab menu in both directions", async () => {
  const h = await mount()
  await h.press("left")
  expect(h.editor().optionalTabMenuActive).toBe(true)
  await h.pressBatch(["right", "right"])
  expect(h.editor().activeTab).toBe("headers")
  expect(h.editor().optionalTabMenuActive).toBe(false)
  await h.pressBatch(["left", "left", "left", "left"])
  expect(h.editor().activeTab).toBe("auth")
  expect(h.editor().optionalTabMenuActive).toBe(false)
  await h.pressBatch(["right", "right", "right", "right"])
  expect(h.editor().activeTab).toBe("headers")
  expect(h.editor().optionalTabMenuActive).toBe(false)
})

it("keeps inline and external script tabs visible and omits + in read-only mode", async () => {
  const h = await mount(
    {
      ...empty,
      scripts: { pre: "console.log(1)", post: "./after.js" },
      tests: "test('ok', () => {})",
    },
    false,
  )
  for (const label of ["Pre Script •", "Post Script •", "Tests •"])
    expect(h.captureCharFrame()).toContain(label)
  expect(h.renderer.root.findDescendantById("folder-tab-add")).toBeUndefined()
  await act(() => {
    h.editor().enterBrowseAt("activity")
    h.editor().exitBrowse()
  })
  await h.settle()
  await h.press("right")
  expect(h.editor().activeTab).toBe("meta")
  expect(h.editor().optionalTabMenuActive).toBe(false)
})
