import { describe, expect, it } from "bun:test"
import { act, useEffect, useRef, useState } from "react"
import { testRender } from "@opentui/react/test-utils"
import { KeymapProvider } from "@opentui/keymap/react"
import { useFolderEditBrowse } from "../../src/hooks/useFolderEditBrowse"
import type { UseFolderDraftResult } from "../../src/hooks/useFolderDraft"
import type { UseEditBrowseResult } from "../../src/hooks/useEditBrowse"
import type { Folder } from "../../src/schema"
import { useJumpMode, type JumpTarget } from "../../src/ui/useJumpMode"
import type { Focus } from "../../src/ui/focus"
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
