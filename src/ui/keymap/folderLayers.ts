import type { UseBindingsLayer } from "@opentui/keymap/react"
import { cloneRequest, deleteFolder, saveFolder } from "../commandActions"
import type { AppKeymapContext } from "./types"

export function createFolderLayers(
  context: AppKeymapContext,
): [UseBindingsLayer, UseBindingsLayer, UseBindingsLayer, UseBindingsLayer] {
  const { keymap, keybinds, global, request, folder, actions } = context
  const canEdit = () => global.modeRef.current === "collection"
  const isFolder = () =>
    keymap.getData("app.focus") === "folder" &&
    keymap.getData("app.overlay") === "none" &&
    keymap.getData("app.view") !== "env-editor"

  const base: UseBindingsLayer = {
    enabled: () => isFolder() && keymap.getData("app.mode") === "base",
    commands: [
      {
        name: "folder.edit-enter",
        enabled: canEdit,
        run: () => {
          folder.folderEbRef.current.enterBrowse()
          global.setFocus("folder")
        },
      },
      {
        name: "folder.tab-prev",
        run: () => folder.folderEbRef.current.cycleInactiveTab(-1),
      },
      {
        name: "folder.tab-next",
        run: () => folder.folderEbRef.current.cycleInactiveTab(1),
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
        name: "request.clone",
        enabled: canEdit,
        run: () => {
          if (cloneRequest(actions)) request.setCloneRequestVisible(true)
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
  }

  const focus: UseBindingsLayer = {
    enabled: isFolder,
    commands: [
      {
        name: "folder.save",
        enabled: canEdit,
        run: () => saveFolder(actions),
      },
      {
        name: "folder.delete",
        enabled: canEdit,
        run: () => {
          const target = deleteFolder(actions)
          if (!target) return
          folder.folderDeletePathRef.current = target.folderPath
          folder.setFolderDeletePending(target.folderName)
        },
      },
    ],
    bindings: [
      { key: keybinds.request_save, cmd: "folder.save" },
      { key: keybinds.request_delete, cmd: "folder.delete" },
    ],
  }

  const browse: UseBindingsLayer = {
    enabled: () => isFolder() && keymap.getData("app.mode") === "browse",
    commands: [
      {
        name: "folder-browse.up",
        run: () => folder.folderEbRef.current.browseUp(),
      },
      {
        name: "folder-browse.down",
        run: () => folder.folderEbRef.current.browseDown(),
      },
      {
        name: "folder-browse.left",
        run: () => folder.folderEbRef.current.browseLeft(),
      },
      {
        name: "folder-browse.right",
        run: () => folder.folderEbRef.current.browseRight(),
      },
      {
        name: "folder-browse.enter",
        enabled: canEdit,
        run: () => folder.folderEbRef.current.enterEdit(),
      },
      {
        name: "folder-browse.escape",
        run: () => {
          folder.folderEbRef.current.exitBrowse()
          global.setFocus("sidebar")
        },
      },
      {
        name: "folder-browse.toggle",
        enabled: canEdit,
        run: () => folder.folderEbRef.current.toggleRow(),
      },
      {
        name: "folder-browse.revert-field",
        run: () => folder.folderEbRef.current.revertField(),
      },
      {
        name: "folder-browse.revert-all",
        run: () => folder.folderEbRef.current.revertAll(),
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
  }

  const edit: UseBindingsLayer = {
    enabled: () => isFolder() && keymap.getData("app.mode") === "edit",
    commands: [
      {
        name: "folder-edit.commit",
        enabled: canEdit,
        run: () => folder.folderEbRef.current.commitEdit(),
      },
      {
        name: "folder-edit.cancel",
        run: () => folder.folderEbRef.current.cancelEdit(),
      },
      {
        name: "folder-edit.tab",
        enabled: canEdit,
        run: () => folder.folderEbRef.current.browseTab(),
      },
    ],
    bindings: [
      { key: "return", cmd: "folder-edit.commit" },
      { key: "escape", cmd: "folder-edit.cancel" },
      { key: "tab", cmd: "folder-edit.tab" },
    ],
  }

  return [base, focus, browse, edit]
}
