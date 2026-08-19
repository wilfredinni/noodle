import type { RefObject } from "react"
import type { CliRenderer } from "@opentui/core"
import type { CommandItem } from "./overlays/CommandPaletteOverlay"
import type { Keybinds } from "./keybind"
import { displayKey } from "./keybind"
import type { Focus } from "./focus"
import type { AppView, YamlEditorState } from "./appState"
import {
  COLLECTION_CATEGORIES,
  GLOBAL_CATEGORIES,
  type SettingsCategory,
  type SettingsScope,
} from "./settings/SettingsView"
import type { UseRequestDraftResult } from "../hooks/useRequestDraft"
import type { UseFolderDraftResult } from "../hooks/useFolderDraft"
import type { UseEnvironmentsResult } from "../hooks/useEnvironments"
import type { UseEnvironmentEditorResult } from "../hooks/useEnvironmentEditor"
import type { Collection } from "../schema"
import type { SendState } from "./sendState"
import type { ResponseQueryController } from "./responseQuery"
import type { ProxyPolicy } from "../proxy"
import type { TlsPolicy } from "../tls"
import type { CollectionMode } from "../collectionPath"
import type { ExternalEditor } from "../externalEditor"
import {
  saveRequest,
  saveFolder,
  editRequestOverlay,
  getEditRequestYamlFile,
  getEditFolderYamlFile,
  cloneRequest,
  deleteRequest,
  deleteFolder,
  canGenerateClientCode,
  fetchOAuth2Token,
  copyOAuth2Token,
  clearCurrentOAuth2Token,
  hasOAuth2Auth,
  cycleEnvironment,
  openEnvironmentPicker,
  openEnvironmentEditor,
  openCookieJar,
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
  installAgentSkill,
  openCollectionExport,
  openCollectionImport,
  openCollectionSwitcher,
  openSettings,
  openCollectionInEditor,
  openAppSettingsInEditor,
  type CommandActionsConfig,
} from "./commandActions"

export type CommandPaletteTarget = "request" | "folder" | "environment"

export interface CommandBuilderContext {
  keybinds: Keybinds
  collectionDir: string
  appConfigDir: string
  externalEditor?: ExternalEditor
  confirmUndoAll: boolean
  renderer: CliRenderer
  proxyPolicy?: ProxyPolicy
  tlsPolicy?: TlsPolicy
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
  folderSaveRef: RefObject<() => void>
  focusedFolderPathRef: RefObject<string | null>
  focusedFolderNameRef: RefObject<string | null>
  folderDeletePathRef: RefObject<string | null>
  getKeymapFocus: () => string
  getView: () => string
  getCollectionMode: () => CollectionMode
  setLayout: (
    v:
      | "stacked"
      | "side-by-side"
      | ((prev: "stacked" | "side-by-side") => "stacked" | "side-by-side"),
  ) => void
  onLayoutChange: (layout: "stacked" | "side-by-side") => boolean
  setHelpVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  setAboutVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  setNewRequestVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  setNewEnvironmentVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  setEnvironmentPickerVisible: (
    v: boolean | ((prev: boolean) => boolean),
  ) => void
  setImportCurlVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  setNewFolderVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  openSettingsView: (scope?: SettingsScope, category?: SettingsCategory) => void
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
  setExportCollectionVisible: (
    v: boolean | ((prev: boolean) => boolean),
  ) => void
  setImportCollectionVisible: (
    v: boolean | ((prev: boolean) => boolean),
  ) => void
  setYamlEditor: (
    v: YamlEditorState | ((prev: YamlEditorState) => YamlEditorState),
  ) => void
  setView: (v: AppView | ((prev: AppView) => AppView)) => void
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
  onReloadCollection: () => void
  paletteTarget: CommandPaletteTarget | null
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
    folderSaveRef: ctx.folderSaveRef,
    focusedFolderPathRef: ctx.focusedFolderPathRef,
    focusedFolderNameRef: ctx.focusedFolderNameRef,
    folderDeletePathRef: ctx.folderDeletePathRef,
    proxyPolicy: ctx.proxyPolicy,
    tlsPolicy: ctx.tlsPolicy,
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
    setNewEnvironmentVisible,
    setEnvironmentPickerVisible,
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
    openSettingsView,
    setExpanded,
    getKeymapFocus,
    getView,
    setHelpVisible,
    setAboutVisible,
    setPreviewIndexProp,
    setCollectionSwitcherVisible,
    setRequestFinderVisible,
    setCodeGeneratorVisible,
    setExportCollectionVisible,
    setImportCollectionVisible,
    setEnvDeletePending,
    getCollectionMode,
    paletteTarget,
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
      id: "request.oauth2-fetch-token",
      label: "Fetch/authorize OAuth 2 token",
      section: "Request",
      run: () => (view === "main" ? fetchOAuth2Token(c) : false),
    },
    {
      id: "request.oauth2-copy-token",
      label: "Copy current OAuth 2 token",
      section: "Request",
      run: () => (view === "main" ? copyOAuth2Token(c) : false),
    },
    {
      id: "request.oauth2-clear-token",
      label: "Clear current OAuth 2 token",
      section: "Request",
      run: () => (view === "main" ? clearCurrentOAuth2Token(c) : false),
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
        if (!editRequestOverlay(c)) return false
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
  const oauth2CommandIds = new Set([
    "request.oauth2-fetch-token",
    "request.oauth2-copy-token",
    "request.oauth2-clear-token",
  ])
  const visibleRequestCommands = requestCommands.filter(
    (command) => !oauth2CommandIds.has(command.id) || hasOAuth2Auth(c),
  )

  const mainEnvCommands: CommandItem[] = [
    {
      id: "env.picker-open",
      label: "Select Environment",
      section: "Environment",
      keybinding: displayKey(keybinds.env_picker),
      run: () => openEnvironmentPicker(setEnvironmentPickerVisible),
    },
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
        setFocus("env-sidebar")
        return true
      },
    },
    {
      id: "cookie-jar.open",
      label: "Cookies",
      section: "Workspace",
      keybinding: keybinds.cookie_jar_open
        ? displayKey(keybinds.cookie_jar_open)
        : undefined,
      run: () => openCookieJar(setView, setFocus),
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
        if (!newEnvironment()) return false
        setNewEnvironmentVisible(true)
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
        return true
      },
    },
  ]

  const workspaceCommands: CommandItem[] = [
    {
      id: "collection.import",
      label: "Import Collection",
      section: "Workspace",
      run: () => openCollectionImport(setImportCollectionVisible),
    },
    {
      id: "collection.export",
      label: "Export Collection",
      section: "Workspace",
      run: () => openCollectionExport(setExportCollectionVisible),
    },
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

  const folderSaveCommand: CommandItem = {
    id: "folder.save",
    label: "Save Folder",
    section: "Folder",
    keybinding: displayKey(keybinds.request_save),
    run: () => {
      if (mode !== "collection") return false
      return saveFolder(c)
    },
  }

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

  const openSettingsCategory = (
    scope: SettingsScope,
    category: SettingsCategory,
  ): boolean => {
    if (!openSettings(c, view)) return false
    openSettingsView(scope, category)
    return true
  }

  const applicationSettingsCommands: CommandItem[] = GLOBAL_CATEGORIES.map(
    ({ id, label }) => ({
      id: `app.settings-${id}`,
      label,
      section: "Application Settings",
      run: () => openSettingsCategory("global", id),
    }),
  )

  const collectionSettingsCommands: CommandItem[] = COLLECTION_CATEGORIES.map(
    ({ id, label }) => ({
      id: `collection.settings-${id}`,
      label,
      section: "Collection Settings",
      run: () => openSettingsCategory("collection", id),
    }),
  )

  const settingsCommands = [
    ...applicationSettingsCommands,
    ...(mode === "collection" ? collectionSettingsCommands : []),
  ]

  const externalEditorCommands: CommandItem[] = [
    {
      id: "collection.open-in-editor",
      label: "Open Collection in Editor",
      section: "Workspace",
      run: () => openCollectionInEditor(ctx.externalEditor, ctx.collectionDir),
    },
  ]

  const systemCommands: CommandItem[] = [
    {
      id: "app.agent-skill-install",
      label: "Install Noodle skill",
      section: "System",
      run: installAgentSkill,
    },
    {
      id: "app.settings-folder-open-in-editor",
      label: "Open Settings in Editor",
      section: "System",
      run: () => openAppSettingsInEditor(ctx.externalEditor, ctx.appConfigDir),
    },
    {
      id: "app.settings-open",
      label: "Open Settings",
      section: "System",
      keybinding: displayKey(keybinds.settings_open),
      run: () => {
        if (!openSettings(c, view)) return false
        openSettingsView()
        return true
      },
    },
    {
      id: "app.help",
      label: "Keyboard Shortcuts",
      section: "System",
      keybinding: displayKey(keybinds.help_toggle),
      run: () => {
        setHelpVisible((prev: boolean) => !prev)
        return true
      },
    },
    {
      id: "app.about",
      label: "About and Updates",
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

  if (paletteTarget === "request") {
    if (mode !== "collection") return []
    return [
      ...visibleRequestCommands.filter((command) =>
        [
          "request.generate-client-code",
          "request.send",
          "request.oauth2-fetch-token",
          "request.oauth2-copy-token",
          "request.oauth2-clear-token",
          "request.save",
          "request.edit-overlay",
          "request.clone",
          "request.delete",
        ].includes(command.id),
      ),
      ...workspaceCommands
        .filter((command) => command.id === "workspace.edit-yaml")
        .map((command) => ({
          ...command,
          label: "Edit Request YAML",
          section: "Request",
        })),
    ]
  }

  if (paletteTarget === "folder") {
    if (mode !== "collection") return []
    return [
      folderSaveCommand,
      ...visibleRequestCommands
        .filter((command) =>
          ["request.new", "request.import-curl"].includes(command.id),
        )
        .map((command) => ({ ...command, section: "Folder" })),
      ...workspaceCommands
        .filter((command) =>
          ["folder.new", "folder.delete", "workspace.edit-yaml"].includes(
            command.id,
          ),
        )
        .map((command) => ({
          ...command,
          label:
            command.id === "workspace.edit-yaml"
              ? "Edit Folder YAML"
              : command.label,
          section: "Folder",
        })),
    ]
  }

  if (paletteTarget === "environment") {
    if (mode !== "collection") return []
    return editorEnvCommands.filter((command) =>
      ["env.save", "env.new", "env.clone", "env.delete"].includes(command.id),
    )
  }

  if (view === "env-editor") {
    return [
      ...(mode === "collection" ? editorEnvCommands : readOnlyCommands),
      ...(mode === "collection" ? workspaceCommands : []),
      ...externalEditorCommands,
      ...settingsCommands,
      ...globalCommands,
      ...systemCommands,
    ]
  }

  if (view === "cookie-jar")
    return [...externalEditorCommands, ...settingsCommands, ...systemCommands]

  if (view === "settings")
    return [...externalEditorCommands, ...settingsCommands, ...systemCommands]

  return [
    ...(mode === "collection" ? visibleRequestCommands : []),
    ...(mode === "collection" ? mainEnvCommands : []),
    ...(mode === "collection" ? workspaceCommands : readOnlyCommands),
    ...mainOnlyCommands,
    ...externalEditorCommands,
    ...settingsCommands,
    ...globalCommands,
    ...systemCommands,
  ]
}
