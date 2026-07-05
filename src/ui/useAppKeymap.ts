import { useBindings, useKeymap } from "@opentui/keymap/react"
import { join } from "node:path"
import { tmpdir } from "node:os"
import type { RefObject } from "react"
import { cycleFocus, toggleExpand, type Focus } from "./focus"
import type { Keybinds } from "./keybind"
import type { UseEditBrowseResult } from "../hooks/useEditBrowse"
import type { UseRequestDraftResult } from "../hooks/useRequestDraft"
import type { UseFolderEditBrowseResult } from "../hooks/useFolderEditBrowse"
import type { UseFolderDraftResult } from "../hooks/useFolderDraft"
import type { UseEnvironmentsResult } from "../hooks/useEnvironments"
import type { UseEnvironmentEditorResult } from "../hooks/useEnvironmentEditor"
import type { Collection } from "../schema"
import type { SendState } from "./sendState"
import { useRenderer } from "./RendererContext"
import { showToast } from "./Toast"
import { findRequestById } from "./tree"

export interface UseAppKeymapRefs {
  ebRef: RefObject<UseEditBrowseResult>
  draftRef: RefObject<UseRequestDraftResult>
  folderEbRef: RefObject<UseFolderEditBrowseResult>
  folderDraftRef: RefObject<UseFolderDraftResult>
  envStateRef: RefObject<UseEnvironmentsResult>
  envEditorRef: RefObject<UseEnvironmentEditorResult>
  collectionRef: RefObject<Collection | null>
  selectedIdRef: RefObject<string | null>
  trySendRef: RefObject<(() => void) | undefined>
  doSaveRef: RefObject<() => void>
  focusRef: RefObject<Focus>
  viewRef: RefObject<"main" | "env-editor">
  activeIndexRef: RefObject<number>
  savingRef: RefObject<boolean>
  expandedRef: RefObject<"request" | "response" | null>
  folderViewRef: RefObject<boolean>
  folderSaveRef: RefObject<() => void>
  focusedFolderPathRef: RefObject<string | null>
  focusedFolderNameRef: RefObject<string | null>
  folderDeletePathRef: RefObject<string | null>
  responseStateRef: RefObject<SendState>
}

export interface UseAppKeymapSetters {
  setFocus: (focus: Focus | ((prev: Focus) => Focus)) => void
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
  setView: (
    v:
      | "main"
      | "env-editor"
      | ((prev: "main" | "env-editor") => "main" | "env-editor"),
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
  setCollectionReloadToken: (n: number | ((prev: number) => number)) => void
  setPreviewIndex: (
    n: number | null | ((prev: number | null) => number | null),
  ) => void
  setEnvDeletePending: (
    s: string | null | ((prev: string | null) => string | null),
  ) => void
  setDeleteConfirmSelection: (n: number | ((prev: number) => number)) => void
  setNewRequestVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  setEditRequestVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  setCloneRequestVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  setRequestDeletePending: (
    s: string | null | ((prev: string | null) => string | null),
  ) => void
  onLayoutChange: (layout: "stacked" | "side-by-side") => void
  setNewFolderVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  setCommandPaletteVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  setFolderDeletePending: (
    s: string | null | ((prev: string | null) => string | null),
  ) => void
  setUndoAllPending: (v: boolean | ((prev: boolean) => boolean)) => void
}

export function useAppKeymap(
  keybinds: Keybinds,
  refs: UseAppKeymapRefs,
  setters: UseAppKeymapSetters,
  collectionDir: string,
  confirmUndoAll: boolean,
): void {
  const keymap = useKeymap()
  const renderer = useRenderer()

  // ── Keymap: Always-On Layer ───────────────────────────────────────
  useBindings(() => ({
    commands: [
      {
        name: "focus.next",
        enabled: () => {
          const e = refs.ebRef.current
          if (e.editState.mode === "editing") {
            const f = e.editState.cursor.field
            if (f === "headers" || f === "params") return false
          }
          return true
        },
        run: () =>
          setters.setFocus((prev: Focus) => {
            const next = cycleFocus(
              prev,
              1,
              refs.viewRef.current,
              refs.expandedRef.current,
              refs.folderViewRef.current,
            )
            if (next === "request" && refs.viewRef.current === "main")
              refs.ebRef.current.enterBrowse()
            return next
          }),
      },
      {
        name: "layout.toggle",
        run: () =>
          setters.setLayout((prev: "stacked" | "side-by-side") => {
            const next = prev === "stacked" ? "side-by-side" : "stacked"
            setters.onLayoutChange(next)
            return next
          }),
      },
      {
        name: "focus.prev",
        enabled: () => {
          const e = refs.ebRef.current
          if (e.editState.mode === "editing") {
            const f = e.editState.cursor.field
            if (f === "headers" || f === "params") return false
          }
          return true
        },
        run: () =>
          setters.setFocus((prev: Focus) => {
            const next = cycleFocus(
              prev,
              -1,
              refs.viewRef.current,
              refs.expandedRef.current,
              refs.folderViewRef.current,
            )
            if (next === "request" && refs.viewRef.current === "main")
              refs.ebRef.current.enterBrowse()
            return next
          }),
      },
      {
        name: "app.help",
        run: () => setters.setHelpVisible((prev: boolean) => !prev),
      },
      {
        name: "request.edit-yaml",
        run: () => {
          if (refs.focusedFolderPathRef.current) return
          const sid = refs.selectedIdRef.current
          if (!sid || !collectionDir) return
          const col = refs.collectionRef.current
          if (!col) return
          const r = findRequestById(col.items, sid)
          if (!r) return
          const filePath = join(collectionDir, `${sid}.yml`)
          setters.setYamlEditor({
            visible: true,
            filePath,
            requestName: r.name,
            returnFocus: refs.focusRef.current,
          })
        },
      },
      {
        name: "request.expand-toggle",
        enabled: () => {
          const f = keymap.getData("app.focus")
          return f === "request" || f === "response"
        },
        run: () => {
          const f = keymap.getData("app.focus") as "request" | "response"
          setters.setExpanded((prev: "request" | "response" | null) =>
            toggleExpand(prev, f),
          )
        },
      },
      {
        name: "response.copy-body",
        enabled: () => {
          const s = refs.responseStateRef.current
          return s?.status === "done"
        },
        run: () => {
          const s = refs.responseStateRef.current
          if (s?.status !== "done") return
          const body = s.response.body
          const tmp = join(tmpdir(), `noodle-copy-${Date.now()}`)
          try {
            Bun.write(tmp, body)
            Bun.spawnSync(["bash", "-c", `pbcopy < "${tmp}"`])
          } catch {
            renderer.copyToClipboardOSC52(body)
          } finally {
            try {
              Bun.spawnSync(["rm", "-f", tmp])
            } catch {
              // cleanup is best-effort; ignore failures
            }
          }
          showToast("Response body copied", "success")
        },
      },
      {
        name: "app.theme",
        run: () => setters.setPreviewIndex(refs.activeIndexRef.current),
      },
      {
        name: "app.command-palette",
        run: () => setters.setCommandPaletteVisible((prev: boolean) => !prev),
      },
      {
        name: "global.undo-all",
        enabled: () => {
          const mode = keymap.getData("app.mode") as string
          const overlay = keymap.getData("app.overlay") as string
          return mode !== "edit" && overlay === "none"
        },
        run: () => {
          const d = refs.draftRef.current
          const fd = refs.folderDraftRef.current
          const ee = refs.envEditorRef.current
          const hasDirty = d.isDirty || fd.isDirty || (ee?.dirty ?? false)
          if (!hasDirty) return

          if (confirmUndoAll) {
            setters.setUndoAllPending(true)
          } else {
            d.revertAllRequests()
            fd.revertAllFolders()
            ee?.revertDraft()
          }
        },
      },
    ],
    bindings: [
      { key: "tab", cmd: "focus.next" },
      { key: "shift+tab", cmd: "focus.prev" },
      { key: keybinds.layout_toggle, cmd: "layout.toggle" },
      { key: keybinds.help_toggle, cmd: "app.help" },
      { key: keybinds.request_edit_yaml, cmd: "request.edit-yaml" },
      { key: keybinds.pane_expand, cmd: "request.expand-toggle" },
      { key: keybinds.response_copy_body, cmd: "response.copy-body" },
      { key: keybinds.theme_picker, cmd: "app.theme" },
      { key: keybinds.command_palette, cmd: "app.command-palette" },
      { key: keybinds.global_undo_all, cmd: "global.undo-all" },
    ],
  }))

  // ── Keymap: Base Layer ─────────────────────────────────────────────
  useBindings(() => ({
    enabled: () =>
      keymap.getData("app.mode") === "base" &&
      keymap.getData("app.focus") !== "folder" &&
      keymap.getData("app.overlay") === "none" &&
      keymap.getData("app.view") !== "env-editor",
    commands: [
      {
        name: "env.editor-open",
        enabled: () => keymap.getData("app.focus") === "sidebar",
        run: () => {
          const name = refs.envStateRef.current.activeEnv?.name
          refs.envEditorRef.current.openEditor(name)
          setters.setView("env-editor")
          setters.setFocus("env-header")
        },
      },
      {
        name: "request.send",
        run: () => refs.trySendRef.current?.(),
      },
      {
        name: "request.save",
        run: () => {
          const d = refs.draftRef.current
          if (!refs.savingRef.current && d.draft && d.isDirty) {
            refs.doSaveRef.current()
          }
        },
      },
      {
        name: "env.cycle",
        run: () => refs.envStateRef.current.cycle(1),
      },
      {
        name: "request.new",
        run: () => setters.setNewRequestVisible(true),
      },
      {
        name: "folder.new",
        run: () => setters.setNewFolderVisible(true),
      },
      {
        name: "request.edit-overlay",
        run: () => {
          if (refs.focusedFolderPathRef.current) return
          const sid = refs.selectedIdRef.current
          if (!sid) return
          const col = refs.collectionRef.current
          if (!col) return
          const req = findRequestById(col.items, sid)
          if (!req) return
          setters.setEditRequestVisible(true)
        },
      },
      {
        name: "request.clone",
        run: () => {
          const sid = refs.selectedIdRef.current
          if (!sid) return
          const col = refs.collectionRef.current
          if (!col) return
          const req = findRequestById(col.items, sid)
          if (!req) return
          setters.setCloneRequestVisible(true)
        },
      },
      {
        name: "request.delete",
        run: () => {
          const folderPath = refs.focusedFolderPathRef.current
          const folderName = refs.focusedFolderNameRef.current
          if (folderPath && folderName) {
            refs.folderDeletePathRef.current = folderPath
            setters.setFolderDeletePending(folderName)
            return
          }
          const sid = refs.selectedIdRef.current
          if (!sid) return
          const col = refs.collectionRef.current
          if (!col) return
          const req = findRequestById(col.items, sid)
          if (!req) return
          setters.setRequestDeletePending(req.name)
        },
      },
      {
        name: "focus.sidebar",
        run: () => setters.setFocus("sidebar"),
      },
    ],
    bindings: [
      { key: keybinds.request_send, cmd: "request.send" },
      { key: keybinds.request_save, cmd: "request.save" },
      { key: keybinds.env_cycle, cmd: "env.cycle" },
      { key: keybinds.env_editor, cmd: "env.editor-open" },
      { key: keybinds.request_new, cmd: "request.new" },
      { key: keybinds.folder_new, cmd: "folder.new" },
      { key: keybinds.request_edit_overlay, cmd: "request.edit-overlay" },
      { key: keybinds.request_clone, cmd: "request.clone" },
      { key: keybinds.request_delete, cmd: "request.delete" },
      { key: "escape", cmd: "focus.sidebar" },
    ],
  }))

  // ── Keymap: Request Focus Layer ─────────────────────────────────────
  useBindings(() => ({
    enabled: () =>
      keymap.getData("app.mode") === "base" &&
      keymap.getData("app.focus") === "request" &&
      keymap.getData("app.overlay") === "none" &&
      keymap.getData("app.view") !== "env-editor",
    commands: [
      {
        name: "request.edit-enter",
        run: () => {
          refs.ebRef.current.enterBrowse()
          setters.setFocus("request")
        },
      },
      {
        name: "request.tab-prev",
        run: () => refs.ebRef.current.cycleInactiveTab(-1),
      },
      {
        name: "request.tab-next",
        run: () => refs.ebRef.current.cycleInactiveTab(1),
      },
    ],
    bindings: [
      { key: "return", cmd: "request.edit-enter" },
      { key: "left", cmd: "request.tab-prev" },
      { key: "right", cmd: "request.tab-next" },
    ],
  }))

  // ── Keymap: Browse Layer ───────────────────────────────────────────
  useBindings(() => ({
    enabled: () =>
      keymap.getData("app.mode") === "browse" &&
      keymap.getData("app.focus") !== "folder" &&
      keymap.getData("app.overlay") === "none" &&
      keymap.getData("app.view") !== "env-editor",
    commands: [
      { name: "browse.up", run: () => refs.ebRef.current.browseUp() },
      { name: "browse.down", run: () => refs.ebRef.current.browseDown() },
      { name: "browse.left", run: () => refs.ebRef.current.browseLeft() },
      { name: "browse.right", run: () => refs.ebRef.current.browseRight() },
      { name: "browse.enter", run: () => refs.ebRef.current.enterEdit() },
      { name: "browse.escape", run: () => refs.ebRef.current.exitBrowse() },
      { name: "browse.delete", run: () => refs.ebRef.current.revertField() },
      { name: "browse.revert-all", run: () => refs.ebRef.current.revertAll() },
      {
        name: "browse.toggle",
        run: () => refs.ebRef.current.toggleRow(),
      },
      {
        name: "browse.send",
        run: () => refs.trySendRef.current?.(),
      },
      {
        name: "browse.toggle-form-type",
        run: () => refs.ebRef.current.toggleFormRowType(),
      },
      {
        name: "browse.save",
        run: () => {
          const d = refs.draftRef.current
          if (!refs.savingRef.current && d.draft && d.isDirty) {
            refs.doSaveRef.current()
          }
        },
      },
    ],
    bindings: [
      { key: "up", cmd: "browse.up" },
      { key: "down", cmd: "browse.down" },
      { key: "left", cmd: "browse.left" },
      { key: "right", cmd: "browse.right" },
      { key: "return", cmd: "browse.enter" },
      { key: "escape", cmd: "browse.escape" },
      { key: keybinds.browse_delete, cmd: "browse.delete" },
      { key: keybinds.browse_revert_all, cmd: "browse.revert-all" },
      { key: "space", cmd: "browse.toggle" },
      { key: keybinds.request_send, cmd: "browse.send" },
      { key: keybinds.request_save, cmd: "browse.save" },
      { key: keybinds.browse_toggle_form_type, cmd: "browse.toggle-form-type" },
    ],
  }))

  // ── Keymap: Folder Init Layer (base mode, folder focused) ──────
  useBindings(() => ({
    enabled: () =>
      keymap.getData("app.mode") === "base" &&
      keymap.getData("app.focus") === "folder" &&
      keymap.getData("app.overlay") === "none" &&
      keymap.getData("app.view") !== "env-editor",
    commands: [
      {
        name: "folder.edit-enter",
        run: () => {
          refs.folderEbRef.current?.enterBrowse()
          setters.setFocus("folder")
        },
      },
      {
        name: "folder.tab-prev",
        run: () => refs.folderEbRef.current?.cycleInactiveTab(-1),
      },
      {
        name: "folder.tab-next",
        run: () => refs.folderEbRef.current?.cycleInactiveTab(1),
      },
      {
        name: "request.new",
        run: () => setters.setNewRequestVisible(true),
      },
      {
        name: "folder.new",
        run: () => setters.setNewFolderVisible(true),
      },
      {
        name: "request.clone",
        run: () => {
          const sid = refs.selectedIdRef.current
          if (!sid) return
          const col = refs.collectionRef.current
          if (!col) return
          const req = findRequestById(col.items, sid)
          if (!req) return
          setters.setCloneRequestVisible(true)
        },
      },
    ],
    bindings: [
      { key: "return", cmd: "folder.edit-enter" },
      { key: "left", cmd: "folder.tab-prev" },
      { key: "right", cmd: "folder.tab-next" },
      { key: keybinds.request_new, cmd: "request.new" },
      { key: keybinds.folder_new, cmd: "folder.new" },
      { key: keybinds.request_clone, cmd: "request.clone" },
    ],
  }))

  // ── Keymap: Folder Focus Layer (always when folder is focused) ───
  useBindings(() => ({
    enabled: () =>
      keymap.getData("app.focus") === "folder" &&
      keymap.getData("app.overlay") === "none" &&
      keymap.getData("app.view") !== "env-editor",
    commands: [
      {
        name: "folder.save",
        run: () => refs.folderSaveRef.current(),
      },
      {
        name: "folder.delete",
        run: () => {
          const folderPath = refs.focusedFolderPathRef.current
          const folderName = refs.focusedFolderNameRef.current
          if (folderPath && folderName) {
            refs.folderDeletePathRef.current = folderPath
            setters.setFolderDeletePending(folderName)
          }
        },
      },
    ],
    bindings: [
      { key: keybinds.request_save, cmd: "folder.save" },
      { key: keybinds.request_delete, cmd: "folder.delete" },
    ],
  }))

  // ── Keymap: Folder Browse Layer ──────────────────────────────────
  useBindings(() => ({
    enabled: () =>
      keymap.getData("app.focus") === "folder" &&
      keymap.getData("app.mode") === "browse" &&
      keymap.getData("app.overlay") === "none" &&
      keymap.getData("app.view") !== "env-editor",
    commands: [
      {
        name: "folder-browse.up",
        run: () => refs.folderEbRef.current?.browseUp(),
      },
      {
        name: "folder-browse.down",
        run: () => refs.folderEbRef.current?.browseDown(),
      },
      {
        name: "folder-browse.left",
        run: () => refs.folderEbRef.current?.browseLeft(),
      },
      {
        name: "folder-browse.right",
        run: () => refs.folderEbRef.current?.browseRight(),
      },
      {
        name: "folder-browse.enter",
        run: () => refs.folderEbRef.current?.enterEdit(),
      },
      {
        name: "folder-browse.escape",
        run: () => {
          refs.folderEbRef.current?.exitBrowse()
          setters.setFocus("sidebar")
        },
      },
      {
        name: "folder-browse.toggle",
        run: () => refs.folderEbRef.current?.toggleRow(),
      },
      {
        name: "folder-browse.revert-field",
        run: () => refs.folderEbRef.current?.revertField(),
      },
      {
        name: "folder-browse.revert-all",
        run: () => refs.folderEbRef.current?.revertAll(),
      },
    ],
    bindings: [
      { key: "up", cmd: "folder-browse.up" },
      { key: "down", cmd: "folder-browse.down" },
      { key: "left", cmd: "folder-browse.left" },
      { key: "right", cmd: "folder-browse.right" },
      { key: "return", cmd: "folder-browse.enter" },
      { key: "escape", cmd: "folder-browse.escape" },
      { key: "space", cmd: "folder-browse.toggle" },
      { key: keybinds.browse_delete, cmd: "folder-browse.revert-field" },
      { key: keybinds.browse_revert_all, cmd: "folder-browse.revert-all" },
    ],
  }))

  // ── Keymap: Folder Edit Layer ────────────────────────────────────
  useBindings(() => ({
    enabled: () =>
      keymap.getData("app.focus") === "folder" &&
      keymap.getData("app.mode") === "edit" &&
      keymap.getData("app.overlay") === "none" &&
      keymap.getData("app.view") !== "env-editor",
    commands: [
      {
        name: "folder-edit.commit",
        run: () => refs.folderEbRef.current?.commitEdit(),
      },
      {
        name: "folder-edit.cancel",
        run: () => refs.folderEbRef.current?.cancelEdit(),
      },
      {
        name: "folder-edit.tab",
        run: () => refs.folderEbRef.current?.browseTab(),
      },
    ],
    bindings: [
      { key: "return", cmd: "folder-edit.commit" },
      { key: "escape", cmd: "folder-edit.cancel" },
      { key: "tab", cmd: "folder-edit.tab" },
    ],
  }))

  // ── Keymap: Edit Layer ─────────────────────────────────────────────
  useBindings(() => ({
    enabled: () =>
      keymap.getData("app.mode") === "edit" &&
      keymap.getData("app.focus") !== "folder" &&
      keymap.getData("app.overlay") === "none" &&
      keymap.getData("app.view") !== "env-editor",
    commands: [
      { name: "edit.commit", run: () => refs.ebRef.current.commitEdit() },
      { name: "edit.cancel", run: () => refs.ebRef.current.cancelEdit() },
      { name: "edit.tab", run: () => refs.ebRef.current.browseTab() },
    ],
    bindings: [
      { key: "return", cmd: "edit.commit" },
      { key: "escape", cmd: "edit.cancel" },
      { key: "tab", cmd: "edit.tab" },
    ],
  }))

  // ── Keymap: Env Editor Layer ────────────────────────────────────────
  useBindings(() => ({
    enabled: () =>
      keymap.getData("app.view") === "env-editor" &&
      keymap.getData("app.overlay") === "none",
    commands: [
      {
        name: "env.save",
        run: () => refs.envEditorRef.current.save(),
      },
      {
        name: "env.new",
        run: () => {
          refs.envEditorRef.current.openEditor()
          setters.setFocus("env-header")
        },
      },
      {
        name: "env.clone",
        enabled: () => refs.envEditorRef.current.selectedEnvName !== null,
        run: () => {
          const ee = refs.envEditorRef.current
          if (ee.selectedEnvName) {
            ee.cloneEnv(`${ee.selectedEnvName} - Copy`)
          }
        },
      },
      {
        name: "env.delete",
        enabled: () => refs.envEditorRef.current.selectedEnvName !== null,
        run: () => {
          const ee = refs.envEditorRef.current
          if (ee.selectedEnvName) {
            setters.setEnvDeletePending(ee.selectedEnvName)
            setters.setDeleteConfirmSelection(0)
          }
        },
      },
    ],
    bindings: [
      { key: keybinds.env_save, cmd: "env.save" },
      { key: keybinds.env_new, cmd: "env.new" },
      { key: keybinds.env_clone, cmd: "env.clone" },
      { key: keybinds.env_delete, cmd: "env.delete" },
    ],
  }))
}
