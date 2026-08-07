import type { UseBindingsLayer } from "@opentui/keymap/react"
import { cycleFocus } from "../focus"
import {
  copyResponseBody,
  getEditFolderYamlFile,
  getEditRequestYamlFile,
  openEnvironmentEditor,
  openThemePicker,
  togglePaneExpand,
  undoAll,
} from "../commandActions"
import type { AppKeymapContext } from "./types"

export function createGlobalLayers(
  context: AppKeymapContext,
): [UseBindingsLayer, UseBindingsLayer] {
  const { keymap, keybinds, global, request, folder, environment, actions } =
    context

  const alwaysOn: UseBindingsLayer = {
    commands: [
      {
        name: "focus.next",
        enabled: () => {
          const editState = request.ebRef.current.editState
          if (
            editState.mode === "editing" &&
            (editState.cursor.field === "headers" ||
              editState.cursor.field === "params")
          ) {
            return false
          }
          return keymap.getData("app.overlay") === "none"
        },
        run: () => {
          if (request.ebRef.current.isEditingJsonBody) {
            request.ebRef.current.leaveJsonBodyEditor()
          }
          const next = cycleFocus(
            global.focusRef.current,
            1,
            global.viewRef.current,
            global.expandedRef.current,
            folder.folderViewRef.current,
          )
          if (next === "urlbar") global.setUrlbarSubFocus("select")
          if (next === "request" && global.viewRef.current === "main") {
            request.ebRef.current.enterBrowse()
          }
          if (next === "env-vars" && global.viewRef.current === "env-editor") {
            environment.envEditorRef.current.enterBrowse()
          }
          global.setFocus(next)
        },
      },
      {
        name: "layout.toggle",
        run: () =>
          global.setLayout((prev: "stacked" | "side-by-side") => {
            const next = prev === "stacked" ? "side-by-side" : "stacked"
            global.onLayoutChange(next)
            return next
          }),
      },
      {
        name: "focus.prev",
        enabled: () => {
          const editState = request.ebRef.current.editState
          if (
            editState.mode === "editing" &&
            (editState.cursor.field === "headers" ||
              editState.cursor.field === "params")
          ) {
            return false
          }
          return keymap.getData("app.overlay") === "none"
        },
        run: () => {
          if (request.ebRef.current.isEditingJsonBody) {
            request.ebRef.current.leaveJsonBodyEditor()
          }
          const next = cycleFocus(
            global.focusRef.current,
            -1,
            global.viewRef.current,
            global.expandedRef.current,
            folder.folderViewRef.current,
          )
          if (next === "urlbar") global.setUrlbarSubFocus("text")
          if (next === "request" && global.viewRef.current === "main") {
            request.ebRef.current.enterBrowse()
          }
          if (next === "env-vars" && global.viewRef.current === "env-editor") {
            environment.envEditorRef.current.enterBrowse()
          }
          global.setFocus(next)
        },
      },
      {
        name: "app.help",
        run: () => global.setHelpVisible((prev: boolean) => !prev),
      },
      {
        name: "request.edit-yaml",
        enabled: () =>
          global.modeRef.current === "collection" &&
          keymap.getData("app.overlay") === "none",
        run: () => {
          if (folder.focusedFolderPathRef.current) {
            const file = getEditFolderYamlFile(actions)
            if (!file) return
            global.setYamlEditor({
              visible: true,
              kind: "folder",
              filePath: file.filePath,
              requestName: file.folderName,
              requestId: "",
              folderPath: file.folderPath,
              returnFocus: file.returnFocus,
            })
            return
          }
          const file = getEditRequestYamlFile(actions)
          if (!file) return
          global.setYamlEditor({
            visible: true,
            kind: "request",
            filePath: file.filePath,
            requestName: file.requestName,
            requestId: file.requestId,
            folderPath: "",
            returnFocus: file.returnFocus,
          })
        },
      },
      {
        name: "request.expand-toggle",
        enabled: () => {
          const focus = keymap.getData("app.focus")
          return focus === "request" || focus === "response"
        },
        run: () => {
          togglePaneExpand(
            actions,
            keymap.getData("app.focus") as string,
            global.setExpanded,
          )
        },
      },
      {
        name: "response.copy-body",
        enabled: () => global.responseStateRef.current.status === "done",
        run: () => {
          copyResponseBody(actions)
        },
      },
      {
        name: "response.query",
        enabled: () =>
          keymap.getData("app.overlay") === "none" &&
          keymap.getData("app.focus") === "response" &&
          global.responseStateRef.current.status === "done" &&
          (global.responseQueryRef.current?.canOpen() ?? false),
        run: () => {
          global.responseQueryRef.current?.open()
        },
      },
      {
        name: "app.theme",
        run: () => {
          global.setPreviewIndex(global.activeIndexRef.current)
          openThemePicker()
        },
      },
      {
        name: "app.command-palette",
        enabled: () => {
          const overlay = keymap.getData("app.overlay")
          return overlay === "none" || overlay === "command-palette"
        },
        run: () => global.setCommandPaletteVisible((prev: boolean) => !prev),
      },
      {
        name: "env.editor-open",
        enabled: () => {
          const overlay = keymap.getData("app.overlay")
          return (
            global.modeRef.current === "collection" &&
            (overlay === "none" || overlay === "environment-picker")
          )
        },
        run: () => {
          global.setEnvironmentPickerVisible(false)
          if (global.viewRef.current !== "env-editor") {
            openEnvironmentEditor(actions)
            global.setView("env-editor")
          }
          global.setFocus("env-sidebar")
        },
      },
      {
        name: "request.find",
        enabled: () =>
          keymap.getData("app.overlay") === "none" &&
          keymap.getData("app.mode") !== "edit" &&
          global.viewRef.current === "main",
        run: () => global.setRequestFinderVisible(true),
      },
      {
        name: "collection.switcher",
        enabled: () =>
          keymap.getData("app.overlay") === "none" &&
          keymap.getData("app.view") !== "env-editor",
        run: () => global.setCollectionSwitcherVisible(true),
      },
      {
        name: "global.undo-all",
        enabled: () =>
          global.modeRef.current === "collection" &&
          keymap.getData("app.mode") !== "edit" &&
          keymap.getData("app.overlay") === "none",
        run: () => {
          if (undoAll(actions) && context.confirmUndoAll) {
            global.setUndoAllPending(true)
          }
        },
      },
      {
        name: "jump.enter",
        enabled: () => {
          const focus = keymap.getData("app.focus")
          const editingUrlText =
            focus === "urlbar" && global.urlbarSubFocusRef.current === "text"
          const editingEnvName =
            focus === "env-header" && global.headerFieldRef.current === "name"
          return (
            keymap.getData("app.overlay") === "none" &&
            keymap.getData("app.mode") !== "edit" &&
            keymap.getData("app.jump") !== "active" &&
            !editingUrlText &&
            !editingEnvName &&
            !global.responseQueryRef.current?.isOpen()
          )
        },
        run: () => global.setJumpMode(true),
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
      { key: keybinds.response_query, cmd: "response.query" },
      { key: keybinds.theme_picker, cmd: "app.theme" },
      { key: keybinds.command_palette, cmd: "app.command-palette" },
      { key: keybinds.env_editor, cmd: "env.editor-open" },
      { key: keybinds.request_find, cmd: "request.find" },
      { key: keybinds.collection_switcher, cmd: "collection.switcher" },
      { key: keybinds.global_undo_all, cmd: "global.undo-all" },
      { key: keybinds.jump_mode, cmd: "jump.enter" },
    ],
  }

  const urlbar: UseBindingsLayer = {
    enabled: () =>
      keymap.getData("app.focus") === "urlbar" &&
      keymap.getData("app.overlay") === "none" &&
      keymap.getData("app.view") !== "env-editor",
    commands: [
      {
        name: "urlbar.tab",
        run: () => {
          if (global.urlbarSubFocusRef.current === "select") {
            global.setUrlbarSubFocus("text")
            return
          }
          const next = cycleFocus(
            "urlbar",
            1,
            global.viewRef.current,
            global.expandedRef.current,
            folder.folderViewRef.current,
          )
          if (next === "request" && global.viewRef.current === "main") {
            request.ebRef.current.enterBrowse()
          }
          global.setFocus(next)
        },
      },
      {
        name: "urlbar.prev",
        run: () => {
          if (global.urlbarSubFocusRef.current === "text") {
            global.setUrlbarSubFocus("select")
            return
          }
          global.setFocus(
            cycleFocus(
              "urlbar",
              -1,
              global.viewRef.current,
              global.expandedRef.current,
              folder.folderViewRef.current,
            ),
          )
        },
      },
    ],
    bindings: [
      { key: "tab", cmd: "urlbar.tab" },
      { key: "shift+tab", cmd: "urlbar.prev" },
    ],
  }

  return [alwaysOn, urlbar]
}
