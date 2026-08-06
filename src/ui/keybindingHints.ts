import type { Focus } from "./focus"
import type { Keybinds } from "./keybind"
import { displayKey } from "./keybind"
import type { SendState } from "./sendState"
import type { PaneMode } from "./useEditModeSync"
import type { CollectionMode } from "../app/main"

export interface KeybindingHintsContext {
  view: "main" | "env-editor"
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
  if (ctx.view === "env-editor") {
    return [
      {
        key: displayKey(ctx.keybinds.command_palette),
        word: "commands",
        command: "app.command-palette",
      },
      {
        key: displayKey(ctx.keybinds.help_toggle),
        word: "help",
        command: "app.help",
      },
    ]
  }
  return [
    {
      key: displayKey(ctx.keybinds.jump_mode),
      word: "jump",
      command: "jump.enter",
    },
    {
      key: displayKey(ctx.keybinds.command_palette),
      word: "commands",
      command: "app.command-palette",
    },
    {
      key: displayKey(ctx.keybinds.help_toggle),
      word: "help",
      command: "app.help",
    },
  ]
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
          key: displayKey(kb.env_delete),
          word: "delete",
          command: "env.delete",
        },
        {
          key: displayKey(kb.env_clone),
          word: "clone",
          command: "env.clone",
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
        key: displayKey(kb.request_delete),
        word: "delete",
        command: "request.delete",
      },
      {
        key: displayKey(kb.request_clone),
        word: "clone",
        command: "request.clone",
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
      return [
        ...foldSegments,
        ...toggleSegments,
        {
          key: displayKey(kb.browse_delete),
          word: "revert",
          command: "browse.delete",
        },
        {
          key: displayKey(kb.browse_revert_all),
          word: "revert all",
          command: "browse.revert-all",
        },
        {
          key: displayKey(kb.pane_expand),
          word: "expand",
          command: "request.expand-toggle",
        },
        {
          key: displayKey(kb.request_save),
          word: "save",
          command: "browse.save",
        },
      ]
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
      return [
        ...toggleSegments,
        {
          key: displayKey(kb.browse_delete),
          word: "revert",
          command: "folder-browse.revert-field",
        },
        {
          key: displayKey(kb.browse_revert_all),
          word: "revert all",
          command: "folder-browse.revert-all",
        },
        {
          key: displayKey(kb.request_save),
          word: "save",
          command: "folder.save",
        },
      ]
    }
    return []
  }

  return []
}
