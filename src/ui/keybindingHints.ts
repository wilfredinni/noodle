import type { Focus } from "./focus"
import type { Keybinds } from "./keybind"
import { displayKey } from "./keybind"
import type { SendState } from "./sendState"
import type { PaneMode } from "./useEditModeSync"
import type { CollectionMode } from "../collectionPath"
import type { AppView } from "./appState"
import type { SettingsCategory } from "./settings/SettingsView"
import type { RunnerPhase } from "../hooks/useCollectionRunner"

export interface KeybindingHintsContext {
  view: AppView
  focus: Focus
  paneMode: PaneMode
  collectionMode: CollectionMode
  collectionError?: boolean
  overlayActive: boolean
  jumpMode: boolean
  tab?: string
  bodyType?: string
  sendState: SendState
  queryVisible?: boolean
  responseBodyEditorAvailable?: boolean
  settingsCategory?: SettingsCategory
  runnerPhase?: RunnerPhase
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

  if (ctx.collectionError) {
    if (ctx.focus === "sidebar") {
      return [
        {
          key: displayKey(kb.request_delete),
          word: "delete",
          command: "request.delete",
        },
      ]
    }
    if (ctx.focus === "folder") {
      return [
        {
          key: displayKey(kb.request_save),
          word: "save",
          command: "folder.save",
        },
      ]
    }
    return []
  }

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
          key: displayKey(kb.env_secret),
          word: "secret",
          command: "env-browse.secret",
        },
        { key: displayKey(kb.env_save), word: "save", command: "env.save" },
        {
          key: displayKey(kb.env_reveal),
          word: "reveal",
          command: "env-browse.reveal",
        },
        {
          key: displayKey(kb.browse_delete),
          word: "revert",
          command: "env-browse.revert",
        },
      ]
    }
    if (ctx.focus === "env-vars" && ctx.paneMode === "edit") {
      return [
        { key: displayKey(kb.env_save), word: "save", command: "env.save" },
      ]
    }
    return []
  }

  if (ctx.view === "cookie-jar") {
    if (!col) return []
    if (ctx.focus === "cookie-sidebar") {
      return [
        {
          key: displayKey(kb.cookie_delete),
          word: "delete domain",
          command: "cookie.delete",
        },
        {
          key: displayKey(kb.cookie_clear),
          word: "clear all",
          command: "cookie.clear",
        },
        { key: "Esc", word: "close", command: "cookie.close" },
      ]
    }
    return [
      { key: displayKey(kb.cookie_new), word: "add", command: "cookie.new" },
      {
        key: displayKey(kb.cookie_edit),
        word: "edit",
        command: "cookie.edit",
      },
      { key: "Enter", word: "expand", command: "cookie.expand" },
      {
        key: displayKey(kb.cookie_delete_domain),
        word: "delete",
        command: "cookie.delete-cookie",
      },
      {
        key: displayKey(kb.cookie_copy),
        word: "copy",
        command: "cookie.copy",
      },
      { key: "/", word: "filter", command: "cookie.filter" },
      { key: "Esc", word: "close", command: "cookie.close" },
    ]
  }

  if (ctx.view === "settings") {
    const close = { key: "Esc", word: "close settings" }
    if (ctx.focus === "settings-sidebar") {
      return [
        { key: "↑/↓", word: "categories" },
        { key: "←/→", word: "scope" },
        close,
      ]
    }
    if (ctx.settingsCategory === "keyboard") {
      return [
        { key: "Enter", word: "rebind" },
        { key: displayKey(kb.browse_delete), word: "reset" },
        close,
      ]
    }
    if (ctx.settingsCategory === "collections") {
      return [
        { key: "↑/↓", word: "select" },
        { key: "Ctrl+↑/↓", word: "reorder" },
        { key: displayKey(kb.request_delete), word: "unregister" },
      ]
    }
    if (ctx.settingsCategory === "behavior") {
      return [
        { key: "Space", word: "toggle" },
        { key: "Tab", word: "categories" },
        close,
      ]
    }
    if (ctx.settingsCategory === "appearance") {
      return [
        { key: "Enter", word: "choose" },
        { key: "Tab", word: "next" },
        close,
      ]
    }
    if (ctx.settingsCategory === "general") {
      return [{ key: "Tab", word: "next" }, close]
    }
    return [{ key: "Tab", word: "next" }, close]
  }

  if (ctx.view === "runner") {
    if (ctx.runnerPhase === "running") {
      return [{ key: "", word: "run in progress" }]
    }
    if (ctx.focus === "runner-options") {
      return [
        { key: "↑/↓", word: "select" },
        { key: "Enter", word: "edit/run", command: "runner.activate" },
        { key: "Tab", word: "requests", command: "runner.focus-next" },
        { key: "Esc", word: "close", command: "runner.escape" },
      ]
    }
    if (ctx.focus === "runner-requests") {
      return [
        { key: "↑/↓", word: "select" },
        { key: "Space", word: "toggle", command: "runner.toggle" },
        { key: "Tab", word: "options", command: "runner.focus-next" },
        { key: "Esc", word: "close", command: "runner.escape" },
      ]
    }
    if (ctx.focus === "runner-results") {
      return [
        { key: "↑/↓", word: "select" },
        { key: "Enter", word: "details", command: "runner.activate" },
        { key: "←", word: "configure", command: "runner.configure" },
        { key: "Esc", word: "close", command: "runner.escape" },
      ]
    }
    return [
      { key: "PgUp/PgDn", word: "scroll" },
      { key: "a/c", word: "edit assert/capture" },
      { key: "Tab", word: "results", command: "runner.focus-next" },
      { key: "Esc", word: "close", command: "runner.escape" },
    ]
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
      (ctx.bodyType === undefined ||
        ctx.bodyType === "json" ||
        ctx.bodyType === "xml")
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
        word:
          ctx.tab === "assertions" || ctx.tab === "captures"
            ? "delete"
            : "revert",
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
    if (ctx.sendState.status === "done" && ctx.tab === "cookies") {
      return [
        { key: "↑/↓", word: "select" },
        { key: "Enter", word: "details" },
        {
          key: displayKey(kb.pane_expand),
          word: "expand",
          command: "request.expand-toggle",
        },
      ]
    }
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
