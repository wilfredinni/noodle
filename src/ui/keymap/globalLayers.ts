import type { UseBindingsLayer } from "@opentui/keymap/react"
import { cycleFocus } from "../focus"
import {
  copyResponseBody,
  getEditFolderYamlFile,
  getEditRequestYamlFile,
  openCookieJar,
  openEnvironmentEditor,
  openSettings,
  openThemePicker,
  togglePaneExpand,
  undoAll,
} from "../commandActions"
import type { AppKeymapContext } from "./types"
import { CodeEditorRenderable } from "../editor/CodeEditor"

export function createGlobalLayers(
  context: AppKeymapContext,
): [UseBindingsLayer, UseBindingsLayer] {
  const {
    keymap,
    keybinds,
    global,
    request,
    folder,
    environment,
    runner,
    actions,
  } = context
  const isTextInputActive = () => {
    const focus = keymap.getData("app.focus")
    return (
      keymap.getData("app.mode") === "edit" ||
      keymap.getData("app.text-input") === true ||
      (focus === "urlbar" && global.urlbarSubFocusRef.current === "text") ||
      (focus === "env-header" && global.headerFieldRef.current === "name") ||
      global.responseQueryRef.current?.isOpen() === true
    )
  }
  const isRunnerRunning = () =>
    global.viewRef.current === "runner" &&
    runner.runnerRef.current.phase === "running"
  const focusedCodeEditor = () => {
    const focused = context.renderer.currentFocusedRenderable
    return focused instanceof CodeEditorRenderable ? focused : null
  }
  const shortcutEnabled = (binding: string, enabled = true) => {
    if (isRunnerRunning()) return false
    if (!enabled || !isTextInputActive()) return enabled
    const key = binding.startsWith("shift+") ? binding.slice(6) : binding
    return !(
      !binding.startsWith("ctrl+") &&
      !binding.startsWith("alt+") &&
      (key.length === 1 || key === "space")
    )
  }

  const alwaysOn: UseBindingsLayer = {
    commands: [
      {
        name: "focus.next",
        enabled: () => {
          const editState = request.ebRef.current.editState
          if (isRunnerRunning()) return false
          if (
            global.viewRef.current === "main" &&
            editState.mode === "editing" &&
            (editState.cursor.field === "headers" ||
              editState.cursor.field === "params")
          ) {
            return false
          }
          return keymap.getData("app.overlay") === "none"
        },
        run: () => {
          if (
            global.viewRef.current === "main" &&
            request.ebRef.current.isEditingTextBody
          ) {
            request.ebRef.current.leaveTextBodyEditor()
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
        enabled: () => shortcutEnabled(keybinds.layout_toggle),
        run: () =>
          global.setLayout((prev: "stacked" | "side-by-side") => {
            const next = prev === "stacked" ? "side-by-side" : "stacked"
            return global.onLayoutChange(next) ? next : prev
          }),
      },
      {
        name: "focus.prev",
        enabled: () => {
          const editState = request.ebRef.current.editState
          if (isRunnerRunning()) return false
          if (
            global.viewRef.current === "main" &&
            editState.mode === "editing" &&
            (editState.cursor.field === "headers" ||
              editState.cursor.field === "params")
          ) {
            return false
          }
          return keymap.getData("app.overlay") === "none"
        },
        run: () => {
          if (
            global.viewRef.current === "main" &&
            request.ebRef.current.isEditingTextBody
          ) {
            request.ebRef.current.leaveTextBodyEditor()
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
        enabled: () => shortcutEnabled(keybinds.help_toggle),
        run: () => global.setHelpVisible((prev: boolean) => !prev),
      },
      {
        name: "request.edit-yaml",
        enabled: () =>
          shortcutEnabled(
            keybinds.request_edit_yaml,
            global.viewRef.current === "main" &&
              global.modeRef.current === "collection" &&
              keymap.getData("app.overlay") === "none",
          ),
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
          return shortcutEnabled(
            keybinds.pane_expand,
            global.viewRef.current === "main" &&
              (focus === "request" || focus === "response"),
          )
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
        name: "collection.runner",
        enabled: () =>
          shortcutEnabled(
            keybinds.runner_open,
            global.modeRef.current === "collection" &&
              global.viewRef.current === "main" &&
              keymap.getData("app.overlay") === "none",
          ),
        run: () => runner.open(null),
      },
      {
        name: "editor.fold-all",
        enabled: () =>
          shortcutEnabled(
            keybinds.editor_fold_all,
            keybinds.editor_fold_all !== "" && focusedCodeEditor() !== null,
          ),
        run: () => focusedCodeEditor()?.foldAll(),
      },
      {
        name: "editor.unfold-all",
        enabled: () =>
          shortcutEnabled(
            keybinds.editor_unfold_all,
            keybinds.editor_unfold_all !== "" && focusedCodeEditor() !== null,
          ),
        run: () => focusedCodeEditor()?.unfoldAll(),
      },
      {
        name: "response.copy-body",
        enabled: () =>
          shortcutEnabled(
            keybinds.response_copy_body,
            global.viewRef.current === "main" &&
              global.responseStateRef.current.status === "done",
          ),
        run: () => {
          copyResponseBody(actions)
        },
      },
      {
        name: "response.query",
        enabled: () =>
          shortcutEnabled(
            keybinds.response_query,
            keymap.getData("app.overlay") === "none" &&
              global.viewRef.current === "main" &&
              keymap.getData("app.focus") === "response" &&
              global.responseStateRef.current.status === "done" &&
              (global.responseQueryRef.current?.canOpen() ?? false),
          ),
        run: () => {
          global.responseQueryRef.current?.open()
        },
      },
      {
        name: "app.theme",
        enabled: () => shortcutEnabled(keybinds.theme_picker),
        run: () => {
          global.setPreviewIndex(global.activeIndexRef.current)
          openThemePicker()
        },
      },
      {
        name: "app.command-palette",
        enabled: () => {
          const overlay = keymap.getData("app.overlay")
          return shortcutEnabled(
            keybinds.command_palette,
            overlay === "none" || overlay === "command-palette",
          )
        },
        run: () => global.setCommandPaletteVisible((prev: boolean) => !prev),
      },
      {
        name: "env.editor-open",
        enabled: () => {
          const overlay = keymap.getData("app.overlay")
          return shortcutEnabled(
            keybinds.env_editor,
            global.modeRef.current === "collection" &&
              global.viewRef.current !== "settings" &&
              (overlay === "none" || overlay === "environment-picker"),
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
        name: "app.settings-open",
        enabled: () =>
          shortcutEnabled(
            keybinds.settings_open,
            global.viewRef.current !== "runner" &&
              keymap.getData("app.overlay") === "none",
          ),
        run: () => {
          if (!openSettings(actions, global.viewRef.current)) return
          global.openSettingsView()
        },
      },
      {
        name: "request.find",
        enabled: () =>
          shortcutEnabled(
            keybinds.request_find,
            keymap.getData("app.overlay") === "none" &&
              keymap.getData("app.mode") !== "edit" &&
              global.viewRef.current === "main",
          ),
        run: () => global.setRequestFinderVisible(true),
      },
      {
        name: "collection.switcher",
        enabled: () =>
          shortcutEnabled(
            keybinds.collection_switcher,
            keymap.getData("app.overlay") === "none" &&
              keymap.getData("app.view") !== "env-editor" &&
              keymap.getData("app.view") !== "runner",
          ),
        run: () => global.setCollectionSwitcherVisible(true),
      },
      {
        name: "cookie-jar.open",
        enabled: () =>
          shortcutEnabled(
            keybinds.cookie_jar_open,
            keybinds.cookie_jar_open !== "" &&
              global.modeRef.current === "collection" &&
              global.viewRef.current === "main" &&
              keymap.getData("app.overlay") === "none",
          ),
        run: () => {
          openCookieJar(global.setView, global.setFocus)
        },
      },
      {
        name: "global.undo-all",
        enabled: () =>
          shortcutEnabled(
            keybinds.global_undo_all,
            global.viewRef.current === "main" &&
              global.modeRef.current === "collection" &&
              keymap.getData("app.mode") !== "edit" &&
              keymap.getData("app.overlay") === "none",
          ),
        run: () => {
          if (undoAll(actions) && context.confirmUndoAll) {
            global.setUndoAllPending(true)
          }
        },
      },
      {
        name: "jump.enter",
        enabled: () =>
          shortcutEnabled(
            keybinds.jump_mode,
            keymap.getData("app.overlay") === "none" &&
              global.viewRef.current !== "runner" &&
              keymap.getData("app.jump") !== "active",
          ),
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
      { key: keybinds.runner_open, cmd: "collection.runner" },
      ...(keybinds.editor_fold_all
        ? [{ key: keybinds.editor_fold_all, cmd: "editor.fold-all" }]
        : []),
      ...(keybinds.editor_unfold_all
        ? [{ key: keybinds.editor_unfold_all, cmd: "editor.unfold-all" }]
        : []),
      { key: keybinds.response_copy_body, cmd: "response.copy-body" },
      { key: keybinds.response_query, cmd: "response.query" },
      { key: keybinds.theme_picker, cmd: "app.theme" },
      { key: keybinds.command_palette, cmd: "app.command-palette" },
      { key: keybinds.env_editor, cmd: "env.editor-open" },
      { key: keybinds.settings_open, cmd: "app.settings-open" },
      { key: keybinds.request_find, cmd: "request.find" },
      { key: keybinds.collection_switcher, cmd: "collection.switcher" },
      ...(keybinds.cookie_jar_open
        ? [{ key: keybinds.cookie_jar_open, cmd: "cookie-jar.open" }]
        : []),
      { key: keybinds.global_undo_all, cmd: "global.undo-all" },
      { key: keybinds.jump_mode, cmd: "jump.enter" },
    ],
  }

  const urlbar: UseBindingsLayer = {
    enabled: () =>
      keymap.getData("app.focus") === "urlbar" &&
      keymap.getData("app.overlay") === "none" &&
      keymap.getData("app.view") === "main",
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
