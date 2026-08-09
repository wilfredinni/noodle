import { describe, expect, it } from "bun:test"
import { act, useRef } from "react"
import { KeymapProvider } from "@opentui/keymap/react"
import type { UseEnvironmentEditorResult } from "../../src/hooks/useEnvironmentEditor"
import { useDialogIntercepts } from "../../src/ui/intercepts/useDialogIntercepts"
import { createTestRender } from "../testRender"
import { setupKeymap } from "./_helpers"

const testRender = createTestRender()

function DialogHarness({
  onPendingChange,
  onConfirm,
}: {
  onPendingChange: (path: string | null) => void
  onConfirm: (path: string) => void
}) {
  const envEditorRef = useRef<UseEnvironmentEditorResult>(null!)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftRef = useRef({ revertAllRequests: () => {} })
  const folderDraftRef = useRef({ revertAllFolders: () => {} })

  useDialogIntercepts({
    activeOverlay: "collection-unregister",
    setSaveState: () => {},
    envDeletePending: null,
    setEnvDeletePending: () => {},
    collectionUnregisterPending: "/tmp/one",
    setCollectionUnregisterPending: onPendingChange,
    onCollectionUnregisterConfirm: onConfirm,
    envEditorRef,
    clearSaveTimer: () => {},
    saveTimerRef,
    collectionSwitchPending: null,
    setCollectionSwitchPending: () => {},
    onCollectionSwitchConfirm: () => {},
    importOpenPending: null,
    setImportOpenPending: () => {},
    onImportOpenConfirm: () => {},
    reloadPending: false,
    setReloadPending: () => {},
    onReloadConfirm: () => {},
    requestDeletePending: null,
    setRequestDeletePending: () => {},
    onRequestDeleteConfirm: () => {},
    folderDeletePending: null,
    setFolderDeletePending: () => {},
    onFolderDeleteConfirm: () => {},
    undoAllPending: false,
    setUndoAllPending: () => {},
    draftRef,
    folderDraftRef,
    initPending: false,
    setInitPending: () => {},
    onInitConfirm: () => {},
    updateConfirmVisible: false,
    onConfirmInstall: () => {},
    onCancelUpdate: () => {},
  })

  return null
}

describe("collection unregister dialog", () => {
  for (const key of ["y", "return"]) {
    it(`confirms with ${key}`, async () => {
      const { keymap, host, cleanup } = setupKeymap()
      const pendingChanges: Array<string | null> = []
      const confirmed: string[] = []
      const backgroundKeys: string[] = []
      const dispose = keymap.intercept(
        "key",
        (ctx) => backgroundKeys.push(ctx.event.name),
        { priority: 0 },
      )
      const { renderOnce } = await testRender(
        <KeymapProvider keymap={keymap}>
          <DialogHarness
            onPendingChange={(path) => pendingChanges.push(path)}
            onConfirm={(path) => confirmed.push(path)}
          />
        </KeymapProvider>,
        { width: 1, height: 1 },
      )
      await renderOnce()
      await act(async () => host.press(key))
      expect(pendingChanges).toEqual([null])
      expect(confirmed).toEqual(["/tmp/one"])
      expect(backgroundKeys).toEqual([])
      dispose()
      cleanup()
    })
  }

  for (const key of ["n", "escape"]) {
    it(`cancels with ${key}`, async () => {
      const { keymap, host, cleanup } = setupKeymap()
      const pendingChanges: Array<string | null> = []
      const confirmed: string[] = []
      const { renderOnce } = await testRender(
        <KeymapProvider keymap={keymap}>
          <DialogHarness
            onPendingChange={(path) => pendingChanges.push(path)}
            onConfirm={(path) => confirmed.push(path)}
          />
        </KeymapProvider>,
        { width: 1, height: 1 },
      )
      await renderOnce()
      await act(async () => host.press(key))
      expect(pendingChanges).toEqual([null])
      expect(confirmed).toEqual([])
      cleanup()
    })
  }
})
