import type { UseBindingsLayer } from "@opentui/keymap/react"
import {
  cloneRequest,
  cycleEnvironment,
  deleteFolder,
  deleteRequest,
  editRequestOverlay,
  openEnvironmentEditor,
  saveRequest,
  sendRequest,
} from "../commandActions"
import type { AppKeymapContext } from "./types"

export function createRequestLayers(
  context: AppKeymapContext,
): [UseBindingsLayer, UseBindingsLayer, UseBindingsLayer, UseBindingsLayer] {
  const { keymap, keybinds, global, request, folder, actions } = context
  const canEdit = () => global.modeRef.current === "collection"
  const isMainBase = () =>
    keymap.getData("app.mode") === "base" &&
    keymap.getData("app.focus") !== "folder" &&
    keymap.getData("app.overlay") === "none" &&
    keymap.getData("app.view") !== "env-editor"

  const base: UseBindingsLayer = {
    enabled: isMainBase,
    commands: [
      {
        name: "env.editor-open",
        enabled: () => keymap.getData("app.focus") === "sidebar" && canEdit(),
        run: () => {
          openEnvironmentEditor(actions)
          global.setView("env-editor")
          global.setFocus("env-sidebar")
        },
      },
      {
        name: "request.send",
        enabled: canEdit,
        run: () => {
          sendRequest(actions)
        },
      },
      {
        name: "request.save",
        enabled: canEdit,
        run: () => {
          saveRequest(actions)
        },
      },
      {
        name: "env.cycle",
        enabled: canEdit,
        run: () => {
          cycleEnvironment(actions)
        },
      },
      {
        name: "request.new",
        enabled: canEdit,
        run: () => request.setNewRequestVisible(true),
      },
      {
        name: "folder.new",
        enabled: canEdit,
        run: () => folder.setNewFolderVisible(true),
      },
      {
        name: "request.edit-overlay",
        enabled: canEdit,
        run: () => {
          if (editRequestOverlay(actions)) request.setEditRequestVisible(true)
        },
      },
      {
        name: "request.clone",
        enabled: canEdit,
        run: () => {
          if (cloneRequest(actions)) request.setCloneRequestVisible(true)
        },
      },
      {
        name: "request.delete",
        enabled: canEdit,
        run: () => {
          const targetFolder = deleteFolder(actions)
          if (targetFolder) {
            folder.folderDeletePathRef.current = targetFolder.folderPath
            folder.setFolderDeletePending(targetFolder.folderName)
            return
          }
          const targetRequest = deleteRequest(actions)
          if (targetRequest) {
            request.setRequestDeletePending(targetRequest.requestName)
          }
        },
      },
      { name: "focus.sidebar", run: () => global.setFocus("sidebar") },
    ],
    bindings: [
      { key: keybinds.request_send, cmd: "request.send" },
      { key: "linefeed", cmd: "request.send" },
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
  }

  const requestFocus: UseBindingsLayer = {
    enabled: () => isMainBase() && keymap.getData("app.focus") === "request",
    commands: [
      {
        name: "request.edit-enter",
        enabled: canEdit,
        run: () => {
          request.ebRef.current.enterBrowse()
          global.setFocus("request")
        },
      },
      {
        name: "request.tab-prev",
        run: () => request.ebRef.current.cycleInactiveTab(-1),
      },
      {
        name: "request.tab-next",
        run: () => request.ebRef.current.cycleInactiveTab(1),
      },
    ],
    bindings: [
      { key: "return", cmd: "request.edit-enter" },
      { key: "left", cmd: "request.tab-prev" },
      { key: "right", cmd: "request.tab-next" },
    ],
  }

  const browse: UseBindingsLayer = {
    enabled: () =>
      keymap.getData("app.mode") === "browse" &&
      keymap.getData("app.focus") === "request" &&
      keymap.getData("app.overlay") === "none" &&
      keymap.getData("app.view") !== "env-editor",
    commands: [
      { name: "browse.up", run: () => request.ebRef.current.browseUp() },
      { name: "browse.down", run: () => request.ebRef.current.browseDown() },
      { name: "browse.first", run: () => request.ebRef.current.browseFirst() },
      { name: "browse.last", run: () => request.ebRef.current.browseLast() },
      { name: "browse.left", run: () => request.ebRef.current.browseLeft() },
      { name: "browse.right", run: () => request.ebRef.current.browseRight() },
      {
        name: "browse.enter",
        enabled: canEdit,
        run: () => request.ebRef.current.enterEdit(),
      },
      { name: "browse.escape", run: () => request.ebRef.current.exitBrowse() },
      { name: "browse.delete", run: () => request.ebRef.current.revertField() },
      {
        name: "browse.revert-all",
        run: () => request.ebRef.current.revertAll(),
      },
      {
        name: "browse.toggle",
        enabled: canEdit,
        run: () => request.ebRef.current.toggleRow(),
      },
      {
        name: "browse.send",
        enabled: canEdit,
        run: () => {
          sendRequest(actions)
        },
      },
      {
        name: "browse.toggle-form-type",
        enabled: canEdit,
        run: () => request.ebRef.current.toggleFormRowType(),
      },
      {
        name: "browse.save",
        enabled: canEdit,
        run: () => {
          saveRequest(actions)
        },
      },
      {
        name: "browse.enter-json-body",
        enabled: () => request.ebRef.current.canEnterJsonBodyEditor,
        run: () => request.ebRef.current.enterJsonBodyEditor(),
      },
    ],
    bindings: [
      { key: "up", cmd: "browse.up" },
      { key: "down", cmd: "browse.down" },
      { key: "home", cmd: "browse.first" },
      { key: "end", cmd: "browse.last" },
      { key: "left", cmd: "browse.left" },
      { key: "right", cmd: "browse.right" },
      { key: "return", cmd: "browse.enter" },
      { key: "escape", cmd: "browse.escape" },
      { key: keybinds.browse_delete, cmd: "browse.delete" },
      { key: keybinds.browse_revert_all, cmd: "browse.revert-all" },
      { key: "space", cmd: "browse.toggle" },
      { key: keybinds.request_send, cmd: "browse.send" },
      { key: "linefeed", cmd: "browse.send" },
      { key: keybinds.request_save, cmd: "browse.save" },
      { key: keybinds.browse_toggle_form_type, cmd: "browse.toggle-form-type" },
      { key: "tab", cmd: "browse.enter-json-body" },
    ],
  }

  const edit: UseBindingsLayer = {
    enabled: () =>
      keymap.getData("app.mode") === "edit" &&
      keymap.getData("app.focus") !== "folder" &&
      keymap.getData("app.overlay") === "none" &&
      keymap.getData("app.view") !== "env-editor",
    commands: [
      {
        name: "edit.commit",
        enabled: () => !request.ebRef.current.isEditingJsonBody,
        run: () => request.ebRef.current.commitEdit(),
      },
      {
        name: "edit.cancel",
        enabled: () => !request.ebRef.current.isEditingJsonBody,
        run: () => request.ebRef.current.cancelEdit(),
      },
      {
        name: "edit.json-escape",
        enabled: () => request.ebRef.current.isEditingJsonBody,
        run: () => request.ebRef.current.returnToJsonBodyTypeSelect(),
      },
      {
        name: "edit.tab",
        run: () => {
          if (request.ebRef.current.isEditingJsonBody) return false
          request.ebRef.current.browseTab()
        },
      },
      {
        name: "edit.json-shift-tab",
        enabled: () => request.ebRef.current.isEditingJsonBody,
        run: () => request.ebRef.current.returnToJsonBodyTypeSelect(),
      },
      {
        name: "edit.json-send",
        enabled: () => request.ebRef.current.isEditingJsonBody && canEdit(),
        run: () => sendRequest(actions),
      },
    ],
    bindings: [
      { key: "return", cmd: "edit.commit" },
      { key: "escape", cmd: "edit.cancel" },
      { key: "escape", cmd: "edit.json-escape" },
      { key: "tab", cmd: "edit.tab" },
      { key: "shift+tab", cmd: "edit.json-shift-tab" },
      { key: keybinds.request_send, cmd: "edit.json-send" },
      { key: "linefeed", cmd: "edit.json-send" },
    ],
  }

  return [base, requestFocus, browse, edit]
}
