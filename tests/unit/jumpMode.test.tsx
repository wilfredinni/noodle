import { expect, it } from "bun:test"
import { act, useRef, useState } from "react"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestRender } from "../testRender"
import { setupKeymap } from "./_helpers"
import { useRequestDraft } from "../../src/hooks/useRequestDraft"
import { useEditBrowse } from "../../src/hooks/useEditBrowse"
import { useFolderDraft } from "../../src/hooks/useFolderDraft"
import { useFolderEditBrowse } from "../../src/hooks/useFolderEditBrowse"
import { RequestPane } from "../../src/ui/RequestPane"
import { FolderPane } from "../../src/ui/FolderPane"
import { ResponsePane } from "../../src/ui/ResponsePane"
import { ThemeProvider, THEMES } from "../../src/ui/theme"
import { CodeEditorRenderable } from "../../src/ui/editor/CodeEditor"
import {
  getAvailableTargets,
  getVisibleRequestTabs,
  getVisibleFolderTabs,
  useJumpMode,
} from "../../src/ui/useJumpMode"
import type { Request, Folder } from "../../src/schema"
import type { Focus } from "../../src/ui/focus"
import type { ResponseTabKind } from "../../src/ui/tabs/uiState"
import type { SendState } from "../../src/ui/sendState"
import { scriptConsoleEntries } from "../../src/ui/ScriptConsole"

const testRender = createTestRender()
const request: Request = {
  id: "request",
  name: "Request",
  method: "GET",
  url: "https://example.com",
  headers: {},
  params: [],
  timeout: 0,
  followRedirects: true,
  maxRedirects: 5,
}
const folder: Folder = {
  id: "folder",
  path: "folder",
  name: "Folder",
  children: [],
}

async function mount(view: "request" | "folder" | "response") {
  const { keymap, host } = setupKeymap()
  let editor!:
    | ReturnType<typeof useEditBrowse>
    | ReturnType<typeof useFolderEditBrowse>
  let setJump!: (value: boolean) => void
  let focus!: Focus
  let jumping = false
  let setItem!: (item: Request & Folder) => void
  let setResponse!: (state: SendState) => void
  let responseTab!: ResponseTabKind
  function Harness() {
    const [item, updateItem] = useState({ ...request, ...folder })
    setItem = updateItem
    const draft = useRequestDraft(item)
    const eb = useEditBrowse(draft.draft, draft)
    const folderDraft = useFolderDraft(item)
    const folderEb = useFolderEditBrowse(folderDraft.folderDraft, folderDraft)
    editor = view === "folder" ? folderEb : eb
    const ebRef = useRef(eb)
    ebRef.current = eb
    const folderEbRef = useRef(folderEb)
    folderEbRef.current = folderEb
    const [jumpMode, setJumpMode] = useState(true)
    jumping = jumpMode
    setJump = setJumpMode
    const [focused, setFocus] = useState<Focus>("sidebar")
    focus = focused
    const [tab, setTab] = useState<ResponseTabKind>("body")
    responseTab = tab
    const [state, updateResponse] = useState<SendState>({ status: "idle" })
    setResponse = updateResponse
    const targetsRef = useRef(new Map())
    targetsRef.current = getAvailableTargets(
      true,
      view === "response" ? "response" : "request",
      view === "folder",
      false,
      false,
      false,
      eb.optionalTabMenuVisible,
      folderEb.optionalTabMenuVisible,
      {
        request: getVisibleRequestTabs(
          draft.draft,
          eb.activeTab,
          eb.revealedOptionalTabs,
        ),
        folder: getVisibleFolderTabs(
          folderDraft.folderDraft,
          folderEb.activeTab,
          folderEb.revealedOptionalTabs,
        ),
        console:
          scriptConsoleEntries(
            state.status === "done" || state.status === "error"
              ? state.execution
              : undefined,
          ).length > 0,
      },
    )
    useJumpMode({
      jumpMode,
      setJumpMode,
      setFocus,
      setUrlbarSubFocus: () => {},
      ebRef,
      folderEbRef,
      envHeaderRef: useRef(null),
      headerFieldRef: useRef("name"),
      pendingHeaderFieldRef: useRef(null),
      setTab: (_id, _pane, next) => setTab(next as ResponseTabKind),
      selectedIdRef: useRef(item.id),
      targetsRef,
      triggerKey: "g",
      sidebarVisible: true,
    })
    const props = {
      focused: focus === view,
      editState: editor.editState,
      editKey: editor.editKey,
      editValue: editor.editValue,
      setEditKey: editor.setEditKey,
      setEditValue: editor.setEditValue,
      activeTab: editor.activeTab,
      revealedOptionalTabs: editor.revealedOptionalTabs,
      tabMenuActive: editor.optionalTabMenuActive,
      onTabMenuActiveChange: editor.setOptionalTabMenuActive,
      onOptionalTabReveal: editor.revealOptionalTab,
      jumpMode,
    }
    if (view === "response")
      return (
        <ResponsePane
          state={state}
          focused={focus === view}
          jumpMode={jumpMode}
          initialTab={tab}
        />
      )
    if (view === "folder")
      return (
        <FolderPane
          {...props}
          collectionDir="/tmp/collection"
          folder={folderDraft.folderDraft}
          activeEnv={null}
          theme={THEMES[0]!}
          onAuthTypeChange={folderDraft.setAuthType}
          onApiKeyPlacementChange={folderDraft.setApiKeyPlacement}
        />
      )
    return <RequestPane {...props} request={draft.draft} />
  }
  const render = await testRender(
    <KeymapProvider keymap={keymap}>
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness />
      </ThemeProvider>
    </KeymapProvider>,
    { width: 180, height: 24 },
  )
  const settle = async () => {
    await act(async () => {
      const source = render.renderer.root.findDescendantById(
        "script-source",
      ) as CodeEditorRenderable | undefined
      await source?.refreshHighlights()
      await render.renderOnce()
    })
  }
  await settle()
  const press = async (key: string) => {
    await act(() => host.press(key))
    await settle()
  }
  return {
    ...render,
    press,
    settle,
    editor: () => editor,
    focus: () => focus,
    jumping: () => jumping,
    responseTab: () => responseTab,
    jump: async () => {
      await act(() => setJump(true))
      await settle()
    },
    update: async (item: Partial<Request & Folder>) => {
      await act(() => setItem({ ...request, ...folder, ...item }))
      await settle()
    },
    response: async (state: SendState) => {
      await act(() => setResponse(state))
      await settle()
    },
    hint: (field: string) => {
      const tab = render.renderer.root.findDescendantById(`tab-${field}`)!
      expect(tab).toBeDefined()
      return render
        .captureCharFrame()
        .split("\n")
        [tab.y - 1]!.slice(tab.x, tab.x + tab.width)
    },
  }
}

for (const view of ["request", "folder"] as const) {
  it(`jumps only to enabled ${view} script tabs and renders matching badges`, async () => {
    const h = await mount(view)
    for (const key of ["d", "f", "j"]) await h.press(key)
    expect(h.jumping()).toBe(true)
    expect(h.focus()).toBe("sidebar")
    await h.press("o")
    expect(h.editor().optionalTabMenuActive).toBe(true)
    expect(h.focus()).toBe(view)
    expect(h.jumping()).toBe(false)
    await act(() => {
      h.editor().setOptionalTabMenuActive(false)
      h.editor().revealOptionalTab("preScript")
    })
    await h.jump()
    expect(h.hint("preScript")).toContain("d")
    await h.press("d")
    expect(h.editor().activeTab).toBe("preScript")
    expect(h.editor().editState.mode).toBe("browsing")
    expect(h.jumping()).toBe(false)

    await h.update({
      scripts: { pre: "console.log(1)", post: "./after.js" },
      tests: "test('ok', () => {})",
    })
    for (const [field, key] of [
      ["preScript", "d"],
      ["postScript", "f"],
      ["tests", "j"],
    ] as const) {
      await h.jump()
      expect(h.hint(field)).toContain(key)
      await h.press(key)
      expect(h.editor().activeTab).toBe(field)
      expect(h.focus()).toBe(view)
      expect(h.jumping()).toBe(false)
    }
    await act(() => h.resize(45, 20))
    await h.jump()
    await h.press("d")
    expect(h.editor().activeTab).toBe("preScript")
    await act(async () => {
      await h.waitForFrame((frame) => frame.includes("Pre Script"))
    })
    await h.jump()
    expect(h.hint("preScript")).toContain("d")
    await h.press("escape")
    await act(() => h.editor().exitBrowse())
    await h.update({ id: "other", path: "other" })
    await h.jump()
    for (const key of ["d", "f", "j"]) await h.press(key)
    expect(h.jumping()).toBe(true)
    for (const field of ["preScript", "postScript", "tests"])
      expect(h.renderer.root.findDescendantById(`tab-${field}`)).toBeUndefined()
    await h.press("escape")
    expect(h.jumping()).toBe(false)
  })
}

it("reveals empty Assert/Capture tabs through direct jumps and keeps them available", async () => {
  const h = await mount("request")
  for (const [field, key] of [
    ["assertions", "v"],
    ["captures", "c"],
  ] as const) {
    expect(h.renderer.root.findDescendantById(`tab-${field}`)).toBeUndefined()
    await h.jump()
    await h.press(key)
    expect(h.editor().activeTab).toBe(field)
    expect(h.focus()).toBe("request")
    expect(h.jumping()).toBe(false)
    await h.jump()
    expect(h.hint(field)).toContain(key)
    await h.press("h")
    await h.jump()
    await h.press(key)
    expect(h.jumping()).toBe(false)
    expect(h.editor().activeTab).toBe(field)
  }
})

it("jumps to Console only while logs make its tab visible", async () => {
  const h = await mount("response")
  await h.press("z")
  expect(h.jumping()).toBe(true)
  expect(h.renderer.root.findDescendantById("tab-console")).toBeUndefined()
  await h.response({
    status: "error",
    request,
    error: new Error("Pre script failed"),
    execution: {
      scripts: {
        evaluated: true,
        results: [
          {
            phase: "pre",
            scope: "request",
            sourceKind: "inline",
            success: false,
            durationMs: 1,
            logs: [{ level: "log", message: "hello" }],
          },
        ],
      },
    },
  })
  expect(h.hint("console")).toContain("z")
  await h.press("z")
  expect(h.responseTab()).toBe("console")
  expect(h.focus()).toBe("response")
  expect(h.jumping()).toBe(false)
  expect(h.captureCharFrame()).toContain("hello")
  await h.response({ status: "idle" })
  await h.jump()
  await h.press("z")
  expect(h.jumping()).toBe(true)
  expect(h.renderer.root.findDescendantById("tab-console")).toBeUndefined()
})
