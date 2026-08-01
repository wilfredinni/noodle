import { describe, expect, it } from "bun:test"
import { act, useEffect, useRef, useState } from "react"
import { testRender } from "@opentui/react/test-utils"
import { KeymapProvider } from "@opentui/keymap/react"
import {
  useFolderEditBrowse,
  type UseFolderEditBrowseResult,
} from "../../src/hooks/useFolderEditBrowse"
import type { UseFolderDraftResult } from "../../src/hooks/useFolderDraft"
import type { UseEditBrowseResult } from "../../src/hooks/useEditBrowse"
import type { Folder } from "../../src/schema"
import { useJumpMode, type JumpTarget } from "../../src/ui/useJumpMode"
import type { Focus } from "../../src/ui/focus"
import type { EnvHeaderPaneHandle } from "../../src/ui/env-editor/EnvHeaderPane"
import { setupKeymap } from "./_helpers"

const folder: Folder = {
  id: "folder",
  name: "Original",
  path: "folder",
  children: [],
  overrides: {
    headers: { Existing: { value: "value", enabled: true } },
  },
}

function createDraftMutators(calls: string[]): UseFolderDraftResult {
  const noop = () => {}
  return {
    folderDraft: folder,
    isDirty: false,
    dirtyPaths: new Set(),
    originalFolder: folder,
    setName: () => calls.push("setName"),
    setSeq: noop,
    setHeaderRow: () => calls.push("setHeaderRow"),
    addHeaderRow: () => calls.push("addHeaderRow"),
    removeHeaderRow: () => calls.push("removeHeaderRow"),
    toggleHeaderRow: noop,
    setAuthType: noop,
    setAuthField: noop,
    setApiKeyPlacement: noop,
    revertAll: noop,
    markSaved: noop,
    revertAllFolders: noop,
    clearFolderDraft: noop,
  }
}

function JumpHarness({
  onSnapshot,
}: {
  onSnapshot: (value: Snapshot) => void
}) {
  const calls = useRef<string[]>([])
  const folderEb = useFolderEditBrowse(
    folder,
    createDraftMutators(calls.current),
  )
  const folderEbRef = useRef(folderEb)
  folderEbRef.current = folderEb
  const ebRef = useRef({} as UseEditBrowseResult)
  const selectedIdRef = useRef<string | null>(null)
  const envHeaderRef = useRef<EnvHeaderPaneHandle | null>(null)
  const headerFieldRef = useRef<"name" | "color">("name")
  const pendingHeaderFieldRef = useRef<"name" | "color" | null>(null)
  const targetsRef = useRef<Map<string, JumpTarget>>(
    new Map([["h", { kind: "folder-tab", field: "headers" }]]),
  )
  const [jumpMode, setJumpMode] = useState(true)
  const [focus, setFocus] = useState<Focus>("folder")

  useEffect(() => {
    folderEb.enterAndEdit()
    folderEb.setEditKey("uncommitted-key")
    folderEb.setEditValue("uncommitted-value")
  }, [])

  useJumpMode({
    jumpMode,
    setJumpMode,
    setFocus,
    setUrlbarSubFocus: () => {},
    ebRef,
    folderEbRef,
    envHeaderRef,
    headerFieldRef,
    pendingHeaderFieldRef,
    setTab: () => {},
    selectedIdRef,
    targetsRef,
    triggerKey: "g",
  })

  useEffect(() => {
    onSnapshot({
      mode: folderEb.editState.mode,
      field: folderEb.editState.cursor.field,
      row: folderEb.editState.cursor.row,
      editKey: folderEb.editKey,
      editValue: folderEb.editValue,
      focus,
      jumpMode,
      calls: calls.current,
    })
  }, [folderEb, focus, jumpMode, onSnapshot])

  return null
}

interface Snapshot {
  mode: string
  field: string
  row: number
  editKey: string
  editValue: string
  focus: Focus
  jumpMode: boolean
  calls: string[]
}

function EnvironmentJumpHarness({
  onSnapshot,
}: {
  onSnapshot: (value: EnvironmentSnapshot) => void
}) {
  const headerCalls = useRef<string[]>([])
  const ebRef = useRef({} as UseEditBrowseResult)
  const folderEbRef = useRef({} as UseFolderEditBrowseResult)
  const selectedIdRef = useRef<string | null>(null)
  const envHeaderRef = useRef<EnvHeaderPaneHandle | null>({
    focusName: () => headerCalls.current.push("name"),
    focusColor: () => headerCalls.current.push("color"),
  })
  const headerFieldRef = useRef<"name" | "color">("name")
  const pendingHeaderFieldRef = useRef<"name" | "color" | null>(null)
  const targetsRef = useRef<Map<string, JumpTarget>>(
    new Map([
      ["s", { kind: "env-sidebar" }],
      ["m", { kind: "env-name" }],
      ["c", { kind: "env-color" }],
      ["v", { kind: "env-vars" }],
    ]),
  )
  const [jumpMode, setJumpMode] = useState(true)
  const [focus, setFocus] = useState<Focus>("env-sidebar")

  useJumpMode({
    jumpMode,
    setJumpMode,
    setFocus,
    setUrlbarSubFocus: () => {},
    ebRef,
    folderEbRef,
    envHeaderRef,
    headerFieldRef,
    pendingHeaderFieldRef,
    setTab: () => {},
    selectedIdRef,
    targetsRef,
    triggerKey: "g",
  })

  useEffect(() => {
    if (focus === "env-header") {
      headerFieldRef.current = pendingHeaderFieldRef.current ?? "name"
      pendingHeaderFieldRef.current = null
    }
  }, [focus])

  useEffect(() => {
    onSnapshot({
      focus,
      jumpMode,
      headerField: headerFieldRef.current,
      headerCalls: headerCalls.current,
    })
  }, [focus, jumpMode, onSnapshot])

  return null
}

interface EnvironmentSnapshot {
  focus: Focus
  jumpMode: boolean
  headerField: "name" | "color"
  headerCalls: string[]
}

describe("useFolderEditBrowse jump mode", () => {
  it("cancels an active edit before jumping to another folder tab", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    let snapshot: Snapshot | undefined
    const render = await testRender(
      <KeymapProvider keymap={keymap}>
        <JumpHarness onSnapshot={(value) => (snapshot = value)} />
      </KeymapProvider>,
      { width: 1, height: 1 },
    )

    await render.renderOnce()
    await render.renderOnce()
    expect(snapshot?.mode).toBe("editing")
    expect(snapshot?.editKey).toBe("uncommitted-key")

    await act(async () => host.press("h"))
    await render.renderOnce()
    await render.renderOnce()

    expect(snapshot).toMatchObject({
      mode: "browsing",
      field: "headers",
      row: 0,
      editKey: "",
      focus: "folder",
      jumpMode: false,
      calls: [],
    })
    cleanup()
  })
})

describe("useJumpMode environment editor", () => {
  it("jumps to each environment editor target", async () => {
    const cases: Array<[string, Focus, "name" | "color", string[]]> = [
      ["s", "env-sidebar", "name", []],
      ["m", "env-header", "name", ["name"]],
      ["c", "env-header", "color", ["color"]],
      ["v", "env-vars", "name", []],
    ]

    for (const [key, focus, headerField, headerCalls] of cases) {
      const { keymap, host, cleanup } = setupKeymap()
      let snapshot: EnvironmentSnapshot | undefined
      const render = await testRender(
        <KeymapProvider keymap={keymap}>
          <EnvironmentJumpHarness onSnapshot={(value) => (snapshot = value)} />
        </KeymapProvider>,
        { width: 1, height: 1 },
      )

      await render.renderOnce()
      await act(async () => host.press(key))
      await render.renderOnce()
      await render.renderOnce()

      expect(snapshot).toMatchObject({
        focus,
        jumpMode: false,
        headerField,
        headerCalls,
      })
      cleanup()
    }
  })
})
