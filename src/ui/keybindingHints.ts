import type { Focus } from "./focus"
import type { Keybinds } from "./keybind"
import { displayKey } from "./keybind"
import type { SendState } from "./sendState"
import type { PaneMode } from "./useEditModeSync"
import type { CollectionMode } from "../app/main"
import type { AppView } from "./appState"
import type { SettingsCategory } from "./settings/SettingsView"

export interface KeybindingHintsContext {
  view: AppView
  focus: Focus
  paneMode: PaneMode
  collectionMode: CollectionMode
  overlayActive: boolean
  jumpMode: boolean
  tab?: string
  bodyType?: string
  sendState: SendState
  queryVisible?: boolean
  responseBodyEditorAvailable?: boolean
  settingsCategory?: SettingsCategory
  keybinds: Keybinds
}

export interface HintSegment {
  key: string
  word: string
  command?: string
}

export interface KeybindingHints {
  header: HintSegment[]
  footer: HintSegment[]
}

export function getKeybindingHints(
  ctx: KeybindingHintsContext,
): KeybindingHints {
  return {
    header: getHeaderHints(ctx),
    footer: getFooterHints(ctx),
  }
}

function getHeaderHints(ctx: KeybindingHintsContext): HintSegment[] {
  if (ctx.overlayActive) {
    return [{ key: "Esc", word: "close" }]
  }
  if (ctx.jumpMode) {
    return [
      { key: "Type key", word: "to jump" },
      { key: "Esc", word: "dismiss" },
    ]
  }
  return []
}

function getFooterHints(ctx: KeybindingHintsContext): HintSegment[] {
  if (ctx.overlayActive) return []

  const { kb } = { kb: ctx.keybinds }
  const col = ctx.collectionMode === "collection"

  if (ctx.view === "env-editor") {
    if (!col) return []
    if (ctx.focus === "env-sidebar") {
      return [
        { key: displayKey(kb.env_new), word: "new", command: "env.new" },
        {
          key: displayKey(kb.env_clone),
          word: "clone",
          command: "env.clone",
        },
        {
          key: displayKey(kb.env_delete),
          word: "delete",
          command: "env.delete",
        },
      ]
    }
    if (ctx.focus === "env-header") {
      return [
        { key: displayKey(kb.env_new), word: "new", command: "env.new" },
        { key: displayKey(kb.env_save), word: "save", command: "env.save" },
      ]
    }
    if (ctx.focus === "env-vars" && ctx.paneMode === "browse") {
      return [
        { key: "Space", word: "toggle", command: "env-browse.toggle" },
        {
          key: displayKey(kb.browse_delete),
          word: "revert",
          command: "env-browse.revert",
        },
        { key: displayKey(kb.env_save), word: "save", command: "env.save" },
      ]
    }
    if (ctx.focus === "env-vars" && ctx.paneMode === "edit") {
      return [
        { key: displayKey(kb.env_save), word: "save", command: "env.save" },
      ]
    }
    return []
  }

  if (ctx.view === "settings") {
    const close = { key: "Esc", word: "close settings" }
    if (ctx.focus === "settings-sidebar") {
      return [
        { key: "↑/↓", word: "categories" },
        { key: "Tab", word: "edit" },
        close,
      ]
    }
    if (ctx.settingsCategory === "keyboard") {
      return [
        { key: "Enter", word: "rebind" },
        { key: "R", word: "reset" },
        close,
      ]
    }
    if (ctx.settingsCategory === "collections") {
      return [
        { key: "Enter", word: "add" },
        { key: "Ctrl+↑/↓", word: "reorder" },
        { key: "Del", word: "unregister" },
      ]
    }
    if (ctx.settingsCategory === "behavior") {
      return [
        { key: "Space", word: "toggle" },
        { key: "Tab", word: "categories" },
        close,
      ]
    }
    if (
      ctx.settingsCategory === "appearance" ||
      ctx.settingsCategory === "general"
    ) {
      return [
        { key: "Enter", word: "choose" },
        { key: "Tab", word: "next" },
        close,
      ]
    }
    return [{ key: "Tab", word: "next" }, close]
  }

  if (ctx.focus === "sidebar") {
    if (!col) return []
    return [
      { key: displayKey(kb.request_new), word: "new", command: "request.new" },
      {
        key: displayKey(kb.folder_new),
        word: "new folder",
        command: "folder.new",
      },
      {
        key: displayKey(kb.request_clone),
        word: "clone",
        command: "request.clone",
      },
      {
        key: displayKey(kb.request_delete),
        word: "delete",
        command: "request.delete",
      },
      {
        key: displayKey(kb.request_save),
        word: "save",
        command: "request.save",
      },
    ]
  }

  if (ctx.focus === "urlbar") {
    if (!col) return []
    return [
      {
        key: displayKey(kb.request_save),
        word: "save",
        command: "request.save",
      },
    ]
  }

  if (ctx.focus === "request") {
    const foldSegments =
      ctx.paneMode === "edit" &&
      ctx.tab === "body" &&
      (ctx.bodyType ?? "json") === "json"
        ? [{ key: "^g", word: "fold" }]
        : []
    if (ctx.paneMode === "base") {
      if (!col) return []
      return [
        ...foldSegments,
        {
          key: displayKey(kb.pane_expand),
          word: "expand",
          command: "request.expand-toggle",
        },
        {
          key: displayKey(kb.request_save),
          word: "save",
          command: "request.save",
        },
      ]
    }
    if (ctx.paneMode === "browse") {
      if (!col) return []
      const toggleSegments =
        ctx.tab === "headers" ||
        ctx.tab === "params" ||
        (ctx.tab === "body" &&
          (ctx.bodyType === "urlencoded" || ctx.bodyType === "multipart"))
          ? [{ key: "Space", word: "toggle", command: "browse.toggle" }]
          : []
      const revert = {
        key: displayKey(kb.browse_delete),
        word: "revert",
        command: "browse.delete",
      }
      const revertAll = {
        key: displayKey(kb.browse_revert_all),
        word: "revert all",
        command: "browse.revert-all",
      }
      const save = {
        key: displayKey(kb.request_save),
        word: "save",
        command: "browse.save",
      }
      const expand = {
        key: displayKey(kb.pane_expand),
        word: "expand",
        command: "request.expand-toggle",
      }
      // StatusBar pins expand and shows only MAX_CONTEXTUAL_HINTS; keep save
      // ahead of revert-all when toggle is present here and in folders below.
      return toggleSegments.length > 0
        ? [...toggleSegments, revert, save, revertAll, expand]
        : [revert, revertAll, save, expand]
    }
    return [
      ...foldSegments,
      {
        key: displayKey(kb.pane_expand),
        word: "expand",
        command: "request.expand-toggle",
      },
    ]
  }

  if (ctx.focus === "response") {
    if (ctx.sendState.status === "done" && ctx.tab === "body") {
      if (ctx.queryVisible) return []
      const foldSegments =
        ctx.responseBodyEditorAvailable === false
          ? []
          : [{ key: "^g", word: "fold" }]
      return [
        ...foldSegments,
        {
          key: displayKey(kb.response_copy_body),
          word: "copy",
          command: "response.copy-body",
        },
        {
          key: displayKey(kb.response_query),
          word: "filter",
          command: "response.query",
        },
        {
          key: displayKey(kb.pane_expand),
          word: "expand",
          command: "request.expand-toggle",
        },
      ]
    }
    return [
      {
        key: displayKey(kb.pane_expand),
        word: "expand",
        command: "request.expand-toggle",
      },
    ]
  }

  if (ctx.focus === "folder") {
    if (ctx.paneMode === "base") {
      if (!col) return []
      return [
        {
          key: displayKey(kb.request_delete),
          word: "delete",
          command: "folder.delete",
        },
        {
          key: displayKey(kb.request_save),
          word: "save",
          command: "folder.save",
        },
      ]
    }
    if (ctx.paneMode === "browse") {
      if (!col) return []
      const toggleSegments =
        ctx.tab === "headers"
          ? [{ key: "Space", word: "toggle", command: "folder-browse.toggle" }]
          : []
      if (ctx.tab === "activity") return []
      const revert = {
        key: displayKey(kb.browse_delete),
        word: "revert",
        command: "folder-browse.revert-field",
      }
      const revertAll = {
        key: displayKey(kb.browse_revert_all),
        word: "revert all",
        command: "folder-browse.revert-all",
      }
      const save = {
        key: displayKey(kb.request_save),
        word: "save",
        command: "folder.save",
      }
      return toggleSegments.length > 0
        ? [...toggleSegments, revert, save, revertAll]
        : [revert, revertAll, save]
    }
    return []
  }

  return []
}
