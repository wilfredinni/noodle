import { createRef } from "react"
import { initialYamlEditorState } from "../../src/ui/appState"
import type { OverlayState } from "../../src/ui/useOverlayState"

const noop = () => {}

/**
 * Builds an `OverlayState` with every overlay hidden.
 *
 * `useOverlayState` owns this shape, so adding an overlay there makes this
 * factory fail to type-check until the default is declared here too. That is
 * the only test-side edit a new overlay needs.
 */
export function makeOverlayState(
  overrides: Partial<OverlayState> = {},
): OverlayState {
  const state: OverlayState = {
    activeOverlay: "none",
    helpVisible: false,
    setHelpVisible: noop,
    aboutVisible: false,
    setAboutVisible: noop,
    environmentPickerVisible: false,
    setEnvironmentPickerVisible: noop,
    yamlEditor: initialYamlEditorState,
    setYamlEditor: noop,
    envDeletePending: null,
    setEnvDeletePending: noop,
    envDeletePendingRef: createRef<
      string | null
    >() as OverlayState["envDeletePendingRef"],
    collectionUnregisterPending: null,
    setCollectionUnregisterPending: noop,
    newEnvironmentVisible: false,
    setNewEnvironmentVisible: noop,
    newEnvironmentRef: createRef() as OverlayState["newEnvironmentRef"],
    cookieFormVisible: false,
    setCookieFormVisible: noop,
    cookieFormRef: createRef() as OverlayState["cookieFormRef"],
    cookieFormInitial: null,
    setCookieFormInitial: noop,
    cookieDeletePending: null,
    setCookieDeletePending: noop,
    cookieDeletePendingRef:
      createRef() as OverlayState["cookieDeletePendingRef"],
    newRequestVisible: false,
    setNewRequestVisible: noop,
    newRequestRef: createRef() as OverlayState["newRequestRef"],
    importCurlVisible: false,
    setImportCurlVisible: noop,
    importCurlRef: createRef() as OverlayState["importCurlRef"],
    editRequestVisible: false,
    setEditRequestVisible: noop,
    editRequestRef: createRef() as OverlayState["editRequestRef"],
    cloneRequestVisible: false,
    setCloneRequestVisible: noop,
    cloneRequestRef: createRef() as OverlayState["cloneRequestRef"],
    requestDeletePending: null,
    setRequestDeletePending: noop,
    newFolderVisible: false,
    setNewFolderVisible: noop,
    newFolderRef: createRef() as OverlayState["newFolderRef"],
    folderDeletePending: null,
    setFolderDeletePending: noop,
    undoAllPending: false,
    setUndoAllPending: noop,
    initPending: false,
    setInitPending: noop,
    commandPaletteVisible: false,
    setCommandPaletteVisible: noop,
    codeGeneratorVisible: false,
    setCodeGeneratorVisible: noop,
    exportCollectionVisible: false,
    setExportCollectionVisible: noop,
    exportCollectionRef: createRef() as OverlayState["exportCollectionRef"],
    importCollectionVisible: false,
    setImportCollectionVisible: noop,
    importCollectionRef: createRef() as OverlayState["importCollectionRef"],
    importCollectionPending: false,
    setImportCollectionPending: noop,
    importOpenPending: null,
    setImportOpenPending: noop,
    requestFinderVisible: false,
    setRequestFinderVisible: noop,
    timelineDetailEntry: null,
    setTimelineDetailEntry: noop,
  }
  return { ...state, ...overrides }
}
