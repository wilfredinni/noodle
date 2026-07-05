import { join } from "node:path"
import type { RefObject } from "react"
import type { CommandItem } from "./CommandPaletteOverlay"
import type { Keybinds } from "./keybind"
import { displayKey } from "./keybind"
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
}

export function buildCommandPaletteCommands(
  ctx: CommandBuilderContext,
): CommandItem[] {
  const {
    keybinds,
    collectionDir,
    confirmUndoAll,
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
    setLayout,
    onLayoutChange,
    setHelpVisible,
    setNewRequestVisible,
    setNewFolderVisible,
    setCloneRequestVisible,
    setEditRequestVisible,
    setRequestDeletePending,
    setFolderDeletePending,
    setYamlEditor,
    setView,
    setFocus,
    setUndoAllPending,
    setExpanded,
    setPreviewIndexProp,
  } = ctx

  return [
    {
      id: "request.send",
      label: "Send Request",
      section: "Actions",
      keybinding: displayKey(keybinds.request_send),
      run: () => trySendRef.current?.(),
    },
    {
      id: "request.save",
      label: "Save Request",
      section: "Actions",
      keybinding: displayKey(keybinds.request_save),
      run: () => {
        const d = draftRef.current
        if (!savingRef.current && d.draft && d.isDirty) {
          doSaveRef.current()
        }
      },
    },
    {
      id: "env.cycle",
      label: "Cycle Environment",
      section: "Actions",
      keybinding: displayKey(keybinds.env_cycle),
      run: () => envStateRef.current.cycle(1),
    },
    {
      id: "response.copy-body",
      label: "Copy Response Body",
      section: "Actions",
      keybinding: displayKey(keybinds.response_copy_body),
      run: () => {
        const s = responseStateRef.current
        if (s?.status !== "done") return
        const body = s.response.body
        let copied = false
        const tmp = `/tmp/noodle-copy-${Date.now()}`
        try {
          Bun.write(tmp, body)
          Bun.spawnSync(["bash", "-c", `pbcopy < "${tmp}"`])
          copied = true
        } catch {
          // fallback failed — toast shows error
        } finally {
          try {
            Bun.spawnSync(["rm", "-f", tmp])
          } catch {
            // cleanup is best-effort; ignore failures
          }
        }
        showToast(
          copied ? "Response body copied" : "Failed to copy response body",
          copied ? "success" : "error",
        )
      },
    },
    {
      id: "layout.toggle",
      label: "Toggle Layout",
      section: "View",
      keybinding: displayKey(keybinds.layout_toggle),
      run: () =>
        setLayout((prev: "stacked" | "side-by-side") => {
          const next = prev === "stacked" ? "side-by-side" : "stacked"
          onLayoutChange(next)
          return next
        }),
    },
    {
      id: "pane.expand",
      label: "Expand/Collapse Pane",
      section: "View",
      keybinding: displayKey(keybinds.pane_expand),
      run: () => {
        const f = getKeymapFocus() as "request" | "response"
        if (f !== "request" && f !== "response") return
        setExpanded((prev: "request" | "response" | null) =>
          prev === f ? null : f,
        )
      },
    },
    {
      id: "app.help",
      label: "Toggle Help",
      section: "View",
      keybinding: displayKey(keybinds.help_toggle),
      run: () => setHelpVisible((prev: boolean) => !prev),
    },
    {
      id: "request.new",
      label: "New Request",
      section: "Create",
      keybinding: displayKey(keybinds.request_new),
      run: () => setNewRequestVisible(true),
    },
    {
      id: "folder.new",
      label: "New Folder",
      section: "Create",
      keybinding: displayKey(keybinds.folder_new),
      run: () => setNewFolderVisible(true),
    },
    {
      id: "request.clone",
      label: "Clone Request",
      section: "Create",
      keybinding: displayKey(keybinds.request_clone),
      run: () => {
        const sid = selectedIdRef.current
        if (!sid) return
        const col = collectionRef.current
        if (!col) return
        const req = findRequestById(col.items, sid)
        if (!req) return
        setCloneRequestVisible(true)
      },
    },
    {
      id: "request.edit-overlay",
      label: "Edit Request Metadata",
      section: "Edit",
      keybinding: displayKey(keybinds.request_edit_overlay),
      run: () => {
        if (focusedFolderPathRef.current) return
        const sid = selectedIdRef.current
        if (!sid) return
        setEditRequestVisible(true)
      },
    },
    {
      id: "request.edit-yaml",
      label: "Edit Request YAML",
      section: "Edit",
      keybinding: displayKey(keybinds.request_edit_yaml),
      run: () => {
        if (focusedFolderPathRef.current) return
        const sid = selectedIdRef.current
        if (!sid || !collectionDir) return
        const col = collectionRef.current
        if (!col) return
        const r = findRequestById(col.items, sid)
        if (!r) return
        const filePath = join(collectionDir, `${sid}.yml`)
        setYamlEditor({
          visible: true,
          filePath,
          requestName: r.name,
          returnFocus: focusRef.current,
        })
      },
    },
    {
      id: "request.delete",
      label: "Delete Request",
      section: "Delete",
      keybinding: displayKey(keybinds.request_delete),
      run: () => {
        const folderPath = focusedFolderPathRef.current
        const folderName = focusedFolderNameRef.current
        if (folderPath && folderName) {
          folderDeletePathRef.current = folderPath
          setFolderDeletePending(folderName)
          return
        }
        const sid = selectedIdRef.current
        if (!sid) return
        const col = collectionRef.current
        if (!col) return
        const req = findRequestById(col.items, sid)
        if (!req) return
        setRequestDeletePending(req.name)
      },
    },
    {
      id: "env.editor-open",
      label: "Open Environment Editor",
      section: "Workspace",
      keybinding: displayKey(keybinds.env_editor),
      run: () => {
        const name = envStateRef.current.activeEnv?.name
        envEditorRef.current.openEditor(name)
        setView("env-editor")
        setFocus("env-sidebar")
      },
    },
    {
      id: "app.theme",
      label: "Open Theme Picker",
      section: "Workspace",
      keybinding: displayKey(keybinds.theme_picker),
      run: () => setPreviewIndexProp(activeIndexRef.current),
    },
    {
      id: "global.undo-all",
      label: "Undo All Unsaved Changes",
      section: "System",
      keybinding: displayKey(keybinds.global_undo_all),
      run: () => {
        const d = draftRef.current
        const fd = folderDraftRef.current
        const ee = envEditorRef.current
        const hasDirty = d.isDirty || fd.isDirty || (ee?.dirty ?? false)
        if (!hasDirty) return
        if (confirmUndoAll) {
          setUndoAllPending(true)
        } else {
          d.revertAllRequests()
          fd.revertAllFolders()
          ee?.revertDraft()
        }
      },
    },
  ]
}
