import type { RefObject } from "react"
import type { CliRenderer } from "@opentui/core"
import type { CommandItem } from "./overlays/CommandPaletteOverlay"
import type { Keybinds } from "./keybind"
import { displayKey } from "./keybind"
import type { Focus } from "./focus"
import type { UseRequestDraftResult } from "../hooks/useRequestDraft"
import type { UseFolderDraftResult } from "../hooks/useFolderDraft"
import type { UseEnvironmentsResult } from "../hooks/useEnvironments"
import type { UseEnvironmentEditorResult } from "../hooks/useEnvironmentEditor"
import type { Collection } from "../schema"
import type { SendState } from "./sendState"
import type { ResponseQueryController } from "./responseQuery"
import {
  saveRequest,
  getEditRequestYamlFile,
  getEditFolderYamlFile,
  cloneRequest,
  deleteRequest,
  deleteFolder,
  copyResponseBody,
  openResponseQuery,
  canGenerateClientCode,
  cycleEnvironment,
  openEnvironmentEditor,
  saveEnvironment,
  newEnvironment,
  cloneEnvironment,
  deleteEnvironment,
  newFolder,
  toggleLayout,
  togglePaneExpand,
  undoAll,
  openThemePicker,
  openAbout,
  openCollectionSwitcher,
  type CommandActionsConfig,
} from "./commandActions"

export interface CommandBuilderContext {
  keybinds: Keybinds
  collectionDir: string
  confirmUndoAll: boolean
  renderer: CliRenderer
  trySendRef: RefObject<(() => void) | undefined>
  draftRef: RefObject<UseRequestDraftResult>
  folderDraftRef: RefObject<UseFolderDraftResult>
  envStateRef: RefObject<UseEnvironmentsResult>
  envEditorRef: RefObject<UseEnvironmentEditorResult>
  collectionRef: RefObject<Collection | null>
  selectedIdRef: RefObject<string | null>
  focusRef: RefObject<Focus>
  responseStateRef: RefObject<SendState>
  responseQueryRef: RefObject<ResponseQueryController | null>
  responseBodyForCopyRef: RefObject<string | null>
  activeIndexRef: RefObject<number>
  savingRef: RefObject<boolean>
  doSaveRef: RefObject<() => void>
  focusedFolderPathRef: RefObject<string | null>
  focusedFolderNameRef: RefObject<string | null>
  folderDeletePathRef: RefObject<string | null>
  getKeymapFocus: () => string
  getView: () => string
  getCollectionMode: () => "collection" | "browse" | "empty"
  setLayout: (
    v:
      | "stacked"
      | "side-by-side"
      | ((prev: "stacked" | "side-by-side") => "stacked" | "side-by-side"),
  ) => void
  onLayoutChange: (layout: "stacked" | "side-by-side") => void
  setHelpVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  setAboutVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  setNewRequestVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  setImportCurlVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  setNewFolderVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  setCloneRequestVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  setEditRequestVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  setRequestDeletePending: (
    s: string | null | ((prev: string | null) => string | null),
  ) => void
  setFolderDeletePending: (
    s: string | null | ((prev: string | null) => string | null),
  ) => void
  setCollectionSwitcherVisible: (
    v: boolean | ((prev: boolean) => boolean),
  ) => void
  setRequestFinderVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  setCodeGeneratorVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  setYamlEditor: (
    v:
      | {
          visible: boolean
          filePath: string
          requestName: string
          requestId: string
          kind: "request" | "folder"
          returnFocus: Focus
          folderPath: string
        }
      | ((prev: {
          visible: boolean
          filePath: string
          requestName: string
          requestId: string
          kind: "request" | "folder"
          returnFocus: Focus
          folderPath: string
        }) => {
          visible: boolean
          filePath: string
          requestName: string
          requestId: string
          kind: "request" | "folder"
          returnFocus: Focus
          folderPath: string
        }),
  ) => void
  setView: (
    v:
      | "main"
      | "env-editor"
      | ((prev: "main" | "env-editor") => "main" | "env-editor"),
  ) => void
  setFocus: (focus: Focus | ((prev: Focus) => Focus)) => void
  setUndoAllPending: (v: boolean | ((prev: boolean) => boolean)) => void
  setInitPending: (v: boolean | ((prev: boolean) => boolean)) => void
  setExpanded: (
    v:
      | "request"
      | "response"
      | null
      | ((
          prev: "request" | "response" | null,
        ) => "request" | "response" | null),
  ) => void
  setPreviewIndexProp: (
    n: number | null | ((prev: number | null) => number | null),
  ) => void
  setEnvDeletePending: (
    s: string | null | ((prev: string | null) => string | null),
  ) => void
  setDeleteConfirmSelection: (n: number | ((prev: number) => number)) => void
  onReloadCollection: () => void
}

function toConfig(ctx: CommandBuilderContext): CommandActionsConfig {
  return {
    collectionDir: ctx.collectionDir,
    confirmUndoAll: ctx.confirmUndoAll,
    renderer: ctx.renderer,
    trySendRef: ctx.trySendRef,
    draftRef: ctx.draftRef,
    folderDraftRef: ctx.folderDraftRef,
    envStateRef: ctx.envStateRef,
    envEditorRef: ctx.envEditorRef,
    collectionRef: ctx.collectionRef,
    selectedIdRef: ctx.selectedIdRef,
    focusRef: ctx.focusRef,
    responseStateRef: ctx.responseStateRef,
    responseQueryRef: ctx.responseQueryRef,
    responseBodyForCopyRef: ctx.responseBodyForCopyRef,
    activeIndexRef: ctx.activeIndexRef,
    savingRef: ctx.savingRef,
    doSaveRef: ctx.doSaveRef,
    focusedFolderPathRef: ctx.focusedFolderPathRef,
    focusedFolderNameRef: ctx.focusedFolderNameRef,
    folderDeletePathRef: ctx.folderDeletePathRef,
  }
}

export function buildCommandPaletteCommands(
  ctx: CommandBuilderContext,
): CommandItem[] {
  const {
    keybinds,
    trySendRef,
    setEditRequestVisible,
    setYamlEditor,
    setNewRequestVisible,
    setImportCurlVisible,
    setCloneRequestVisible,
    setRequestDeletePending,
    setFolderDeletePending,
    setUndoAllPending,
    setInitPending,
    setView,
    setFocus,
    setLayout,
    onLayoutChange,
    setNewFolderVisible,
    setExpanded,
    getKeymapFocus,
    getView,
    setHelpVisible,
    setAboutVisible,
    setPreviewIndexProp,
    setCollectionSwitcherVisible,
    setRequestFinderVisible,
    setCodeGeneratorVisible,
    setEnvDeletePending,
    setDeleteConfirmSelection,
    getCollectionMode,
  } = ctx

  const c = toConfig(ctx)
  const view = getView()
  const mode = getCollectionMode()

  const requestCommands: CommandItem[] = [
    {
      id: "request.find",
      label: "Find Request",
      section: "Request",
      keybinding: displayKey(keybinds.request_find),
      run: () => {
        if (view !== "main") return false
        setRequestFinderVisible(true)
        return true
      },
    },
    {
      id: "request.generate-client-code",
      label: "Generate Code",
      section: "Request",
      run: () => {
        if (view !== "main" || !canGenerateClientCode(c)) return false
        setCodeGeneratorVisible(true)
        return true
      },
    },
    {
      id: "request.send",
      label: "Send Request",
      section: "Request",
      keybinding: displayKey(keybinds.request_send),
      run: () => {
        trySendRef.current?.()
        return true
      },
    },
    {
      id: "request.save",
      label: "Save Request",
      section: "Request",
      keybinding: displayKey(keybinds.request_save),
      run: () => {
        if (mode !== "collection") return false
        return saveRequest(c)
      },
    },
    {
      id: "request.edit-overlay",
      label: "Edit Request",
      section: "Request",
      keybinding: displayKey(keybinds.request_edit_overlay),
      run: () => {
        if (mode !== "collection") return false
        if (!cloneRequest(c)) return false
        setEditRequestVisible(true)
        return true
      },
    },
    {
      id: "request.new",
      label: "New Request",
      section: "Request",
      keybinding: displayKey(keybinds.request_new),
      run: () => {
        setNewRequestVisible(true)
        return true
      },
    },
    {
      id: "request.import-curl",
      label: "Import cURL Request",
      section: "Request",
      run: () => {
        if (mode !== "collection") return false
        setImportCurlVisible(true)
        return true
      },
    },
    {
      id: "request.clone",
      label: "Clone Request",
      section: "Request",
      keybinding: displayKey(keybinds.request_clone),
      run: () => {
        if (mode !== "collection") return false
        if (!cloneRequest(c)) return false
        setCloneRequestVisible(true)
        return true
      },
    },
    {
      id: "request.delete",
      label: "Delete Request",
      section: "Request",
      keybinding: displayKey(keybinds.request_delete),
      run: () => {
        if (mode !== "collection") return false
        const result = deleteRequest(c)
        if (!result) return false
        setRequestDeletePending(result.requestName)
        return true
      },
    },
  ]

  const responseCommands: CommandItem[] = [
    {
      id: "response.query",
      label: "Filter Response with JSONPath",
      section: "Response",
      keybinding: displayKey(keybinds.response_query),
      run: () => openResponseQuery(c),
    },
    {
      id: "response.copy-body",
      label: "Copy Response Body",
      section: "Response",
      keybinding: displayKey(keybinds.response_copy_body),
      run: () => copyResponseBody(c),
    },
  ]

  const mainEnvCommands: CommandItem[] = [
    {
      id: "env.cycle",
      label: "Cycle Environment",
      section: "Environment",
      keybinding: displayKey(keybinds.env_cycle),
      run: () => cycleEnvironment(c),
    },
    {
      id: "env.editor-open",
      label: "Open Environment Editor",
      section: "Environment",
      keybinding: displayKey(keybinds.env_editor),
      run: () => {
        if (!openEnvironmentEditor(c)) return false
        setView("env-editor")
        setFocus("env-header")
        return true
      },
    },
  ]

  const editorEnvCommands: CommandItem[] = [
    {
      id: "env.cycle",
      label: "Cycle Environment",
      section: "Environment",
      keybinding: displayKey(keybinds.env_cycle),
      run: () => cycleEnvironment(c),
    },
    {
      id: "env.save",
      label: "Save Environment",
      section: "Environment",
      keybinding: displayKey(keybinds.env_save),
      run: () => saveEnvironment(c),
    },
    {
      id: "env.new",
      label: "New Environment",
      section: "Environment",
      keybinding: displayKey(keybinds.env_new),
      run: () => {
        if (!newEnvironment(c)) return false
        setFocus("env-header")
        return true
      },
    },
    {
      id: "env.clone",
      label: "Clone Environment",
      section: "Environment",
      keybinding: displayKey(keybinds.env_clone),
      run: () => cloneEnvironment(c),
    },
    {
      id: "env.delete",
      label: "Delete Environment",
      section: "Environment",
      keybinding: displayKey(keybinds.env_delete),
      run: () => {
        const result = deleteEnvironment(c)
        if (!result) return false
        setEnvDeletePending(result.envName)
        setDeleteConfirmSelection(0)
        return true
      },
    },
  ]

  const workspaceCommands: CommandItem[] = [
    {
      id: "folder.new",
      label: "New Folder",
      section: "Workspace",
      keybinding: displayKey(keybinds.folder_new),
      run: () => {
        if (!newFolder()) return false
        setNewFolderVisible(true)
        return true
      },
    },
    {
      id: "folder.delete",
      label: "Delete Folder",
      section: "Workspace",
      keybinding: displayKey(keybinds.request_delete),
      run: () => {
        if (mode !== "collection") return false
        const result = deleteFolder(c)
        if (!result) return false
        c.folderDeletePathRef.current = result.folderPath
        setFolderDeletePending(result.folderName)
        return true
      },
    },
    {
      id: "workspace.edit-yaml",
      label: "Edit Request/Folder YAML",
      section: "Workspace",
      keybinding: displayKey(keybinds.request_edit_yaml),
      run: () => {
        if (mode !== "collection") return false
        if (c.focusedFolderPathRef.current) {
          const result = getEditFolderYamlFile(c)
          if (!result) return false
          setYamlEditor({
            visible: true,
            kind: "folder",
            filePath: result.filePath,
            requestName: result.folderName,
            requestId: "",
            folderPath: result.folderPath,
            returnFocus: result.returnFocus,
          })
          return true
        }
        const file = getEditRequestYamlFile(c)
        if (!file) return false
        setYamlEditor({
          visible: true,
          kind: "request",
          filePath: file.filePath,
          requestName: file.requestName,
          requestId: file.requestId,
          folderPath: "",
          returnFocus: file.returnFocus,
        })
        return true
      },
    },
    {
      id: "layout.toggle",
      label: "Toggle Layout",
      section: "Workspace",
      keybinding: displayKey(keybinds.layout_toggle),
      run: () => toggleLayout(c, setLayout, onLayoutChange),
    },
  ]

  const mainOnlyCommands: CommandItem[] = [
    {
      id: "pane.expand",
      label: "Expand/Collapse Pane",
      section: "Workspace",
      keybinding: displayKey(keybinds.pane_expand),
      run: () => togglePaneExpand(c, getKeymapFocus(), setExpanded),
    },
  ]

  const globalCommands: CommandItem[] = [
    {
      id: "global.undo-all",
      label: "Undo All Unsaved Changes",
      section: "System",
      keybinding: displayKey(keybinds.global_undo_all),
      run: () => {
        if (!undoAll(c)) return false
        if (c.confirmUndoAll) {
          setUndoAllPending(true)
        }
        return true
      },
    },
  ]

  const readOnlyCommands: CommandItem[] = [
    {
      id: "collection.init",
      label: "Initialize Collection",
      section: "Collection",
      run: () => {
        setInitPending(true)
        return true
      },
    },
  ]

  const systemCommands: CommandItem[] = [
    {
      id: "app.help",
      label: "Toggle Help",
      section: "System",
      keybinding: displayKey(keybinds.help_toggle),
      run: () => {
        setHelpVisible((prev: boolean) => !prev)
        return true
      },
    },
    {
      id: "app.about",
      label: "About Noodle",
      section: "System",
      run: () => {
        setAboutVisible(true)
        return openAbout()
      },
    },
    {
      id: "app.theme",
      label: "Open Theme Picker",
      section: "System",
      keybinding: displayKey(keybinds.theme_picker),
      run: () => {
        setPreviewIndexProp(c.activeIndexRef.current)
        return openThemePicker()
      },
    },
    {
      id: "collection.switcher",
      label: "Switch Collection",
      section: "System",
      keybinding: displayKey(keybinds.collection_switcher),
      run: () => {
        if (!openCollectionSwitcher(view)) return false
        setCollectionSwitcherVisible(true)
        return true
      },
    },
    {
      id: "collection.reload",
      label: "Reload Collection",
      section: "System",
      run: () => {
        ctx.onReloadCollection()
        return true
      },
    },
  ]

  if (view === "env-editor") {
    return [
      ...(mode === "collection" ? editorEnvCommands : readOnlyCommands),
      ...(mode === "collection" ? workspaceCommands : []),
      ...globalCommands,
      ...systemCommands,
    ]
  }

  return [
    ...(mode === "collection" ? requestCommands : []),
    ...responseCommands,
    ...(mode === "collection" ? mainEnvCommands : []),
    ...(mode === "collection" ? workspaceCommands : readOnlyCommands),
    ...mainOnlyCommands,
    ...globalCommands,
    ...systemCommands,
  ]
}
