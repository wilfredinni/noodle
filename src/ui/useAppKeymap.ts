import { useBindings, useKeymap } from "@opentui/keymap/react"
import { join } from "node:path"
import type { MutableRefObject } from "react"
import { cycleFocus, type Focus } from "./focus"
import type { Keybinds } from "./keybind"
import type { UseEditBrowseResult } from "../hooks/useEditBrowse"
import type { UseRequestDraftResult } from "../hooks/useRequestDraft"
import type { UseEnvironmentsResult } from "../hooks/useEnvironments"
import type { UseEnvironmentEditorResult } from "../hooks/useEnvironmentEditor"
import type { Collection } from "../schema"

export interface UseAppKeymapRefs {
  ebRef: MutableRefObject<UseEditBrowseResult>
  draftRef: MutableRefObject<UseRequestDraftResult>
  envStateRef: MutableRefObject<UseEnvironmentsResult>
  envEditorRef: MutableRefObject<UseEnvironmentEditorResult>
  collectionRef: MutableRefObject<Collection | null>
  selectedIndexRef: MutableRefObject<number>
  trySendRef: MutableRefObject<(() => void) | undefined>
  doSaveRef: MutableRefObject<() => void>
  focusRef: MutableRefObject<Focus>
  viewRef: MutableRefObject<"main" | "env-editor">
  activeIndexRef: MutableRefObject<number>
  savingRef: MutableRefObject<boolean>
}

export interface UseAppKeymapSetters {
  setFocus: (focus: Focus | ((prev: Focus) => Focus)) => void
  setHelpVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  setLayout: (layout: "stacked" | "side-by-side" | ((prev: "stacked" | "side-by-side") => "stacked" | "side-by-side")) => void
  setView: (v: "main" | "env-editor" | ((prev: "main" | "env-editor") => "main" | "env-editor")) => void
  setYamlEditor: (v: { visible: boolean; filePath: string; requestName: string; returnFocus: Focus } | ((prev: { visible: boolean; filePath: string; requestName: string; returnFocus: Focus }) => { visible: boolean; filePath: string; requestName: string; returnFocus: Focus })) => void
  setCollectionReloadToken: (n: number | ((prev: number) => number)) => void
  setPreviewIndex: (n: number | null | ((prev: number | null) => number | null)) => void
  setEnvDeletePending: (s: string | null | ((prev: string | null) => string | null)) => void
  setDeleteConfirmSelection: (n: number | ((prev: number) => number)) => void
  onLayoutChange: (layout: "stacked" | "side-by-side") => void
}

export function useAppKeymap(
  keybinds: Keybinds,
  refs: UseAppKeymapRefs,
  setters: UseAppKeymapSetters,
  collectionDir: string,
): void {
  const keymap = useKeymap()

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
            const next = cycleFocus(prev, 1, refs.viewRef.current)
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
            const next = cycleFocus(prev, -1, refs.viewRef.current)
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
          const req = refs.collectionRef.current?.requests[refs.selectedIndexRef.current]
          if (!req || !collectionDir) return
          const filePath = join(collectionDir, `${req.id}.yml`)
          setters.setYamlEditor({
            visible: true,
            filePath,
            requestName: req.name,
            returnFocus: refs.focusRef.current,
          })
        },
      },
    ],
    bindings: [
      { key: "tab", cmd: "focus.next" },
      { key: "shift+tab", cmd: "focus.prev" },
      { key: keybinds.layout_toggle, cmd: "layout.toggle" },
      { key: keybinds.help_toggle, cmd: "app.help" },
      { key: keybinds.request_edit_yaml, cmd: "request.edit-yaml" },
    ],
  }))

  // ── Keymap: Base Layer ─────────────────────────────────────────────
  useBindings(() => ({
    enabled: () =>
      keymap.getData("app.mode") === "base" &&
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
          setters.setFocus("env-sidebar")
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
        name: "app.theme",
        run: () => setters.setPreviewIndex(refs.activeIndexRef.current),
      },
      {
        name: "request.edit-enter",
        enabled: () => keymap.getData("app.focus") === "request",
        run: () => {
          refs.ebRef.current.enterBrowse()
          setters.setFocus("request")
        },
      },
      {
        name: "request.tab-prev",
        enabled: () => keymap.getData("app.focus") === "request",
        run: () => refs.ebRef.current.cycleInactiveTab(-1),
      },
      {
        name: "request.tab-next",
        enabled: () => keymap.getData("app.focus") === "request",
        run: () => refs.ebRef.current.cycleInactiveTab(1),
      },
    ],
    bindings: [
      { key: keybinds.request_send, cmd: "request.send" },
      { key: keybinds.request_save, cmd: "request.save" },
      { key: keybinds.env_cycle, cmd: "env.cycle" },
      { key: keybinds.env_editor, cmd: "env.editor-open" },
      { key: keybinds.theme_picker, cmd: "app.theme" },
      { key: "return", cmd: "request.edit-enter" },
      { key: "left", cmd: "request.tab-prev" },
      { key: "right", cmd: "request.tab-next" },
    ],
  }))

  // ── Keymap: Browse Layer ───────────────────────────────────────────
  useBindings(() => ({
    enabled: () =>
      keymap.getData("app.mode") === "browse" &&
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
      { key: keybinds.browse_toggle, cmd: "browse.toggle" },
      { key: keybinds.request_send, cmd: "browse.send" },
      { key: keybinds.request_save, cmd: "browse.save" },
    ],
  }))

  // ── Keymap: Edit Layer ─────────────────────────────────────────────
  useBindings(() => ({
    enabled: () =>
      keymap.getData("app.mode") === "edit" &&
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
