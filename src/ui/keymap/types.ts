import type { CliRenderer } from "@opentui/core"
import type { KeymapProviderProps } from "@opentui/keymap/react"
import type { RefObject } from "react"
import type { UseEditBrowseResult } from "../../hooks/useEditBrowse"
import type { UseEnvironmentEditorResult } from "../../hooks/useEnvironmentEditor"
import type { UseEnvironmentsResult } from "../../hooks/useEnvironments"
import type { UseFolderDraftResult } from "../../hooks/useFolderDraft"
import type { UseFolderEditBrowseResult } from "../../hooks/useFolderEditBrowse"
import type { UseRequestDraftResult } from "../../hooks/useRequestDraft"
import type { Collection } from "../../schema"
import type { AppView, YamlEditorState } from "../appState"
import type { CommandActionsConfig } from "../commandActions"
import type { Focus, UrlBarSubFocus } from "../focus"
import type { Keybinds } from "../keybind"
import type { ResponseQueryController } from "../responseQuery"
import type { SendState } from "../sendState"

export interface AppKeymapRuntime {
  keymap: KeymapProviderProps["keymap"]
  renderer: CliRenderer
  keybinds: Keybinds
  collectionDir: string
  confirmUndoAll: boolean
}

export interface AppKeymapGlobal {
  focusRef: RefObject<Focus>
  headerFieldRef: RefObject<"name" | "color">
  urlbarSubFocusRef: RefObject<UrlBarSubFocus>
  viewRef: RefObject<AppView>
  activeIndexRef: RefObject<number>
  expandedRef: RefObject<"request" | "response" | null>
  responseStateRef: RefObject<SendState>
  responseQueryRef: RefObject<ResponseQueryController | null>
  responseBodyForCopyRef: RefObject<string | null>
  modeRef: RefObject<"collection" | "browse" | "empty" | "invalid">
  setFocus: (focus: Focus | ((prev: Focus) => Focus)) => void
  setUrlbarSubFocus: (focus: UrlBarSubFocus) => void
  setView: (v: AppView | ((prev: AppView) => AppView)) => void
  setHelpVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  setLayout: (
    layout:
      | "stacked"
      | "side-by-side"
      | ((prev: "stacked" | "side-by-side") => "stacked" | "side-by-side"),
  ) => void
  setExpanded: (
    v:
      | "request"
      | "response"
      | null
      | ((
          prev: "request" | "response" | null,
        ) => "request" | "response" | null),
  ) => void
  setYamlEditor: (
    v: YamlEditorState | ((prev: YamlEditorState) => YamlEditorState),
  ) => void
  setPreviewIndex: (
    n: number | null | ((prev: number | null) => number | null),
  ) => void
  setCollectionSwitcherVisible: (
    v: boolean | ((prev: boolean) => boolean),
  ) => void
  setCommandPaletteVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  setRequestFinderVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  setUndoAllPending: (v: boolean | ((prev: boolean) => boolean)) => void
  setJumpMode: (v: boolean | ((prev: boolean) => boolean)) => void
  onLayoutChange: (layout: "stacked" | "side-by-side") => void
}

export interface AppKeymapRequest {
  ebRef: RefObject<UseEditBrowseResult>
  draftRef: RefObject<UseRequestDraftResult>
  collectionRef: RefObject<Collection | null>
  selectedIdRef: RefObject<string | null>
  trySendRef: RefObject<(() => void) | undefined>
  doSaveRef: RefObject<() => void>
  savingRef: RefObject<boolean>
  setNewRequestVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  setEditRequestVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  setCloneRequestVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  setRequestDeletePending: (
    s: string | null | ((prev: string | null) => string | null),
  ) => void
}

export interface AppKeymapFolder {
  folderEbRef: RefObject<UseFolderEditBrowseResult>
  folderDraftRef: RefObject<UseFolderDraftResult>
  folderSaveRef: RefObject<() => void>
  folderViewRef: RefObject<boolean>
  focusedFolderPathRef: RefObject<string | null>
  focusedFolderNameRef: RefObject<string | null>
  folderDeletePathRef: RefObject<string | null>
  setNewFolderVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  setFolderDeletePending: (
    s: string | null | ((prev: string | null) => string | null),
  ) => void
}

export interface AppKeymapEnvironment {
  envStateRef: RefObject<UseEnvironmentsResult>
  envEditorRef: RefObject<UseEnvironmentEditorResult>
  setNewEnvironmentVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  setEnvDeletePending: (
    s: string | null | ((prev: string | null) => string | null),
  ) => void
}

export interface UseAppKeymapArgs {
  runtime: Omit<AppKeymapRuntime, "keymap" | "renderer">
  global: AppKeymapGlobal
  request: AppKeymapRequest
  folder: AppKeymapFolder
  environment: AppKeymapEnvironment
}

export interface AppKeymapContext extends AppKeymapRuntime {
  global: AppKeymapGlobal
  request: AppKeymapRequest
  folder: AppKeymapFolder
  environment: AppKeymapEnvironment
  actions: CommandActionsConfig
}
