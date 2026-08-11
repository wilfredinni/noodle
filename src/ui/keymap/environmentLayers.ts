import type { UseBindingsLayer } from "@opentui/keymap/react"
import {
  cloneEnvironment,
  deleteEnvironment,
  newEnvironment,
  saveEnvironment,
} from "../commandActions"
import type { AppKeymapContext } from "./types"

export function createEnvironmentLayers(
  context: AppKeymapContext,
): [UseBindingsLayer, UseBindingsLayer, UseBindingsLayer] {
  const { keymap, keybinds, global, environment, actions } = context
  const isEnvironmentEditor = () =>
    keymap.getData("app.view") === "env-editor" &&
    keymap.getData("app.overlay") === "none"
  const canEdit = () => global.modeRef.current === "collection"

  const base: UseBindingsLayer = {
    enabled: isEnvironmentEditor,
    commands: [
      {
        name: "env.save",
        enabled: canEdit,
        run: () => {
          saveEnvironment(actions)
        },
      },
      {
        name: "env.new",
        enabled: canEdit,
        run: () => {
          if (newEnvironment()) environment.setNewEnvironmentVisible(true)
        },
      },
      {
        name: "env.clone",
        enabled: () =>
          canEdit() &&
          environment.envEditorRef.current.selectedEnvName !== null,
        run: () => {
          cloneEnvironment(actions)
        },
      },
      {
        name: "env.delete",
        enabled: () =>
          canEdit() &&
          environment.envEditorRef.current.selectedEnvName !== null,
        run: () => {
          const target = deleteEnvironment(actions)
          if (target) environment.setEnvDeletePending(target.envName)
        },
      },
      {
        name: "env.clone.copy-secrets",
        enabled: () => environment.envEditorRef.current.clonePrompt !== null,
        run: () => {
          void environment.envEditorRef.current.confirmClone(true)
        },
      },
      {
        name: "env.clone.declarations-only",
        enabled: () => environment.envEditorRef.current.clonePrompt !== null,
        run: () => {
          void environment.envEditorRef.current.confirmClone(false)
        },
      },
    ],
    bindings: [
      { key: keybinds.env_save, cmd: "env.save" },
      { key: keybinds.env_new, cmd: "env.new" },
      { key: keybinds.env_clone, cmd: "env.clone" },
      { key: keybinds.env_delete, cmd: "env.delete" },
      { key: "y", cmd: "env.clone.copy-secrets" },
      { key: "n", cmd: "env.clone.declarations-only" },
    ],
  }

  const browse: UseBindingsLayer = {
    enabled: () =>
      isEnvironmentEditor() &&
      keymap.getData("app.focus") === "env-vars" &&
      keymap.getData("app.mode") === "browse",
    commands: [
      {
        name: "env-browse.up",
        run: () => environment.envEditorRef.current.browseUp(),
      },
      {
        name: "env-browse.down",
        run: () => environment.envEditorRef.current.browseDown(),
      },
      {
        name: "env-browse.first",
        run: () => environment.envEditorRef.current.browseFirst(),
      },
      {
        name: "env-browse.last",
        run: () => environment.envEditorRef.current.browseLast(),
      },
      {
        name: "env-browse.enter",
        enabled: canEdit,
        run: () => environment.envEditorRef.current.enterEdit(),
      },
      {
        name: "env-browse.escape",
        run: () => environment.envEditorRef.current.exitBrowse(),
      },
      {
        name: "env-browse.toggle",
        enabled: canEdit,
        run: () => {
          const state = environment.envEditorRef.current.editState
          if (!state.addingRow && state.row >= 0) {
            environment.envEditorRef.current.toggleVar(state.row)
          }
        },
      },
      {
        name: "env-browse.revert",
        enabled: canEdit,
        run: () => {
          const state = environment.envEditorRef.current.editState
          if (!state.addingRow && state.row >= 0) {
            environment.envEditorRef.current.revertVar(state.row)
          }
        },
      },
      {
        name: "env-browse.secret",
        enabled: canEdit,
        run: () => {
          const state = environment.envEditorRef.current.editState
          if (!state.addingRow && state.row >= 0) {
            environment.envEditorRef.current.toggleSecret(state.row)
          }
        },
      },
      {
        name: "env-browse.reveal",
        run: () => {
          const state = environment.envEditorRef.current.editState
          if (!state.addingRow && state.row >= 0) {
            environment.envEditorRef.current.toggleReveal(state.row)
          }
        },
      },
      {
        name: "env.save",
        enabled: canEdit,
        run: () => {
          saveEnvironment(actions)
        },
      },
    ],
    bindings: [
      { key: "up", cmd: "env-browse.up" },
      { key: "down", cmd: "env-browse.down" },
      { key: "home", cmd: "env-browse.first" },
      { key: "end", cmd: "env-browse.last" },
      { key: "return", cmd: "env-browse.enter" },
      { key: "escape", cmd: "env-browse.escape" },
      { key: "space", cmd: "env-browse.toggle" },
      { key: keybinds.browse_delete, cmd: "env-browse.revert" },
      { key: keybinds.env_secret, cmd: "env-browse.secret" },
      { key: keybinds.env_reveal, cmd: "env-browse.reveal" },
      { key: keybinds.env_save, cmd: "env.save" },
    ],
  }

  const edit: UseBindingsLayer = {
    enabled: () =>
      isEnvironmentEditor() &&
      keymap.getData("app.focus") === "env-vars" &&
      keymap.getData("app.mode") === "edit",
    commands: [
      {
        name: "env-edit.commit",
        enabled: canEdit,
        run: () => environment.envEditorRef.current.commitEdit(),
      },
      {
        name: "env-edit.cancel",
        run: () => environment.envEditorRef.current.cancelEdit(),
      },
      {
        name: "env-edit.tab",
        run: () => environment.envEditorRef.current.browseTab(),
      },
      {
        name: "env.save",
        enabled: canEdit,
        run: () => {
          saveEnvironment(actions)
        },
      },
    ],
    bindings: [
      { key: "return", cmd: "env-edit.commit" },
      { key: "escape", cmd: "env-edit.cancel" },
      { key: "tab", cmd: "env-edit.tab" },
      { key: keybinds.env_save, cmd: "env.save" },
    ],
  }

  return [base, browse, edit]
}
