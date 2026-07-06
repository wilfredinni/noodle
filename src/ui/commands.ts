import { join } from "node:path"
import type { RefObject } from "react"
import type { CliRenderer } from "@opentui/core"
import type { CommandItem } from "./CommandPaletteOverlay"
import type { Keybinds } from "./keybind"
import { displayKey } from "./keybind"
import { copyToClipboard } from "./clipboard"
import { showToast } from "./Toast"
import { findRequestById } from "./tree"
import type { Focus } from "./focus"
import type { UseRequestDraftResult } from "../hooks/useRequestDraft"
import type { UseFolderDraftResult } from "../hooks/useFolderDraft"
import type { UseEnvironmentsResult } from "../hooks/useEnvironments"
import type { UseEnvironmentEditorResult } from "../hooks/useEnvironmentEditor"
import type { Collection } from "../schema"
import type { SendState } from "./sendState"

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
  activeIndexRef: RefObject<number>
  savingRef: RefObject<boolean>
  doSaveRef: RefObject<() => void>
  focusedFolderPathRef: RefObject<string | null>
  focusedFolderNameRef: RefObject<string | null>
  folderDeletePathRef: RefObject<string | null>
  getKeymapFocus: () => string
  getView: () => string
  setLayout: (
    v:
      | "stacked"
      | "side-by-side"
      | ((prev: "stacked" | "side-by-side") => "stacked" | "side-by-side"),
  ) => void
  onLayoutChange: (layout: "stacked" | "side-by-side") => void
  setHelpVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  setNewRequestVisible: (v: boolean | ((prev: boolean) => boolean)) => void
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
  setYamlEditor: (
    v:
      | {
          visible: boolean
          filePath: string
          requestName: string
          returnFocus: Focus
        }
      | ((prev: {
          visible: boolean
          filePath: string
          requestName: string
          returnFocus: Focus
        }) => {
          visible: boolean
          filePath: string
          requestName: string
          returnFocus: Focus
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
}

export function buildCommandPaletteCommands(
  ctx: CommandBuilderContext,
): CommandItem[] {
  const {
    keybinds,
    collectionDir,
    confirmUndoAll,
    renderer,
    trySendRef,
    draftRef,
    folderDraftRef,
    envStateRef,
    envEditorRef,
    collectionRef,
    selectedIdRef,
    focusRef,
    responseStateRef,
    activeIndexRef,
    savingRef,
    doSaveRef,
    focusedFolderPathRef,
    focusedFolderNameRef,
    folderDeletePathRef,
    getKeymapFocus,
    getView,
    setLayout,
    onLayoutChange,
    setHelpVisible,
    setNewRequestVisible,
    setNewFolderVisible,
    setCloneRequestVisible,
    setEditRequestVisible,
    setRequestDeletePending,
    setFolderDeletePending,
    setCollectionSwitcherVisible,
    setYamlEditor,
    setView,
    setFocus,
    setUndoAllPending,
    setExpanded,
    setPreviewIndexProp,
    setEnvDeletePending,
  } = ctx

  return [
    // ── Request ──────────────────────────────────────────────────────
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
        const d = draftRef.current
        if (!savingRef.current && d.draft && d.isDirty) {
          doSaveRef.current()
          return true
        }
        return false
      },
    },
    {
      id: "request.edit-overlay",
      label: "Edit Request",
      section: "Request",
      keybinding: displayKey(keybinds.request_edit_overlay),
      run: () => {
        if (focusedFolderPathRef.current) return false
        const sid = selectedIdRef.current
        if (!sid) return false
        const col = collectionRef.current
        if (!col) return false
        const req = findRequestById(col.items, sid)
        if (!req) return false
        setEditRequestVisible(true)
        return true
      },
    },
    {
      id: "request.edit-yaml",
      label: "Edit Request YAML",
      section: "Request",
      keybinding: displayKey(keybinds.request_edit_yaml),
      run: () => {
        if (focusedFolderPathRef.current) return false
        const sid = selectedIdRef.current
        if (!sid || !collectionDir) return false
        const col = collectionRef.current
        if (!col) return false
        const r = findRequestById(col.items, sid)
        if (!r) return false
        const filePath = join(collectionDir, `${sid}.yml`)
        setYamlEditor({
          visible: true,
          filePath,
          requestName: r.name,
          returnFocus: focusRef.current,
        })
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
      id: "request.clone",
      label: "Clone Request",
      section: "Request",
      keybinding: displayKey(keybinds.request_clone),
      run: () => {
        const sid = selectedIdRef.current
        if (!sid) return false
        const col = collectionRef.current
        if (!col) return false
        const req = findRequestById(col.items, sid)
        if (!req) return false
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
        if (focusedFolderPathRef.current) return false
        const sid = selectedIdRef.current
        if (!sid) return false
        const col = collectionRef.current
        if (!col) return false
        const req = findRequestById(col.items, sid)
        if (!req) return false
        setRequestDeletePending(req.name)
        return true
      },
    },
    {
      id: "global.undo-all",
      label: "Undo All Unsaved Changes",
      section: "Request",
      keybinding: displayKey(keybinds.global_undo_all),
      run: () => {
        const d = draftRef.current
        const fd = folderDraftRef.current
        const ee = envEditorRef.current
        const hasDirty = d.isDirty || fd.isDirty || (ee?.dirty ?? false)
        if (!hasDirty) return false
        if (confirmUndoAll) {
          setUndoAllPending(true)
        } else {
          d.revertAllRequests()
          fd.revertAllFolders()
          ee?.revertDraft()
        }
        return true
      },
    },
    // ── Response ─────────────────────────────────────────────────────
    {
      id: "response.copy-body",
      label: "Copy Response Body",
      section: "Response",
      keybinding: displayKey(keybinds.response_copy_body),
      run: () => {
        const s = responseStateRef.current
        if (s?.status !== "done") return false
        const body = s.response.body
        if (copyToClipboard(body, renderer)) {
          showToast("Response body copied", "success")
          return true
        } else {
          showToast("Failed to copy response body", "error")
          return false
        }
      },
    },
    // ── Environment ──────────────────────────────────────────────────
    {
      id: "env.cycle",
      label: "Cycle Environment",
      section: "Environment",
      keybinding: displayKey(keybinds.env_cycle),
      run: () => {
        envStateRef.current.cycle(1)
        return true
      },
    },
    {
      id: "env.editor-open",
      label: "Open Environment Editor",
      section: "Environment",
      keybinding: displayKey(keybinds.env_editor),
      run: () => {
        const name = envStateRef.current.activeEnv?.name
        envEditorRef.current.openEditor(name)
        setView("env-editor")
        setFocus("env-header")
        return true
      },
    },
    ...(getView() === "env-editor"
      ? ([
          {
            id: "env.save",
            label: "Save Environment",
            section: "Environment",
            keybinding: displayKey(keybinds.env_save),
            run: () => {
              envEditorRef.current.save()
              return true
            },
          },
          {
            id: "env.new",
            label: "New Environment",
            section: "Environment",
            keybinding: displayKey(keybinds.env_new),
            run: () => {
              envEditorRef.current.openEditor()
              setFocus("env-header")
              return true
            },
          },
          {
            id: "env.clone",
            label: "Clone Environment",
            section: "Environment",
            keybinding: displayKey(keybinds.env_clone),
            run: () => {
              const ee = envEditorRef.current
              if (ee.selectedEnvName) {
                ee.cloneEnv(`${ee.selectedEnvName} - Copy`)
                return true
              }
              return false
            },
          },
          {
            id: "env.delete",
            label: "Delete Environment",
            section: "Environment",
            keybinding: displayKey(keybinds.env_delete),
            run: () => {
              const ee = envEditorRef.current
              if (ee.selectedEnvName) {
                setEnvDeletePending(ee.selectedEnvName)
                return true
              }
              return false
            },
          },
        ] as CommandItem[])
      : []),
    // ── Workspace ────────────────────────────────────────────────────
    {
      id: "folder.new",
      label: "New Folder",
      section: "Workspace",
      keybinding: displayKey(keybinds.folder_new),
      run: () => {
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
        const folderPath = focusedFolderPathRef.current
        const folderName = focusedFolderNameRef.current
        if (!folderPath || !folderName) return false
        folderDeletePathRef.current = folderPath
        setFolderDeletePending(folderName)
        return true
      },
    },
    {
      id: "layout.toggle",
      label: "Toggle Layout",
      section: "Workspace",
      keybinding: displayKey(keybinds.layout_toggle),
      run: () => {
        setLayout((prev: "stacked" | "side-by-side") => {
          const next = prev === "stacked" ? "side-by-side" : "stacked"
          onLayoutChange(next)
          return next
        })
        return true
      },
    },
    {
      id: "pane.expand",
      label: "Expand/Collapse Pane",
      section: "Workspace",
      keybinding: displayKey(keybinds.pane_expand),
      run: () => {
        const f = getKeymapFocus() as "request" | "response"
        if (f !== "request" && f !== "response") return false
        setExpanded((prev: "request" | "response" | null) =>
          prev === f ? null : f,
        )
        return true
      },
    },
    // ── System ───────────────────────────────────────────────────────
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
      id: "app.theme",
      label: "Open Theme Picker",
      section: "System",
      keybinding: displayKey(keybinds.theme_picker),
      run: () => {
        setPreviewIndexProp(activeIndexRef.current)
        return true
      },
    },
    {
      id: "collection.switcher",
      label: "Switch Collection",
      section: "System",
      keybinding: displayKey(keybinds.collection_switcher),
      run: () => {
        if (getView() === "env-editor") {
          showToast(
            "Cannot switch collections from environment editor",
            "warning",
          )
          return false
        }
        setCollectionSwitcherVisible(true)
        return true
      },
    },
  ]
}
