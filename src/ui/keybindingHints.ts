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
  keybinds: Keybinds
}

export interface HintSegment {
  key: string
  word: string
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
      { key: displayKey(ctx.keybinds.command_palette), word: "commands" },
      { key: displayKey(ctx.keybinds.help_toggle), word: "help" },
    ]
  }
  return [
    { key: displayKey(ctx.keybinds.jump_mode), word: "jump" },
    { key: displayKey(ctx.keybinds.command_palette), word: "commands" },
    { key: displayKey(ctx.keybinds.help_toggle), word: "help" },
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
        { key: displayKey(kb.env_new), word: "new" },
        { key: displayKey(kb.env_delete), word: "delete" },
        { key: displayKey(kb.env_clone), word: "clone" },
      ]
    }
    if (ctx.focus === "env-header") {
      return [
        { key: displayKey(kb.env_new), word: "new" },
        { key: displayKey(kb.env_save), word: "save" },
      ]
    }
    if (ctx.focus === "env-vars" && ctx.paneMode === "browse") {
      return [
        { key: "Space", word: "toggle" },
        { key: displayKey(kb.browse_delete), word: "revert" },
        { key: displayKey(kb.env_save), word: "save" },
      ]
    }
    if (ctx.focus === "env-vars" && ctx.paneMode === "edit") {
      return [{ key: displayKey(kb.env_save), word: "save" }]
    }
    return []
  }

  if (ctx.focus === "sidebar") {
    if (!col) return []
    return [
      { key: displayKey(kb.request_new), word: "new" },
      { key: displayKey(kb.folder_new), word: "new folder" },
      { key: displayKey(kb.request_delete), word: "delete" },
      { key: displayKey(kb.request_clone), word: "clone" },
      { key: displayKey(kb.request_save), word: "save" },
    ]
  }

  if (ctx.focus === "urlbar") {
    if (!col) return []
    return [{ key: displayKey(kb.request_save), word: "save" }]
  }

  if (ctx.focus === "request") {
    if (ctx.paneMode === "base") {
      if (!col) return []
      return [
        { key: displayKey(kb.pane_expand), word: "expand" },
        { key: displayKey(kb.request_save), word: "save" },
      ]
    }
    if (ctx.paneMode === "browse") {
      if (!col) return []
      const toggleSegments =
        ctx.tab === "headers" ||
        ctx.tab === "params" ||
        (ctx.tab === "body" &&
          (ctx.bodyType === "urlencoded" || ctx.bodyType === "multipart"))
          ? [{ key: "Space", word: "toggle" }]
          : []
      return [
        ...toggleSegments,
        { key: displayKey(kb.browse_delete), word: "revert" },
        { key: displayKey(kb.browse_revert_all), word: "revert all" },
        { key: displayKey(kb.pane_expand), word: "expand" },
        { key: displayKey(kb.request_save), word: "save" },
      ]
    }
    return [{ key: displayKey(kb.pane_expand), word: "expand" }]
  }

  if (ctx.focus === "response") {
    if (ctx.sendState.status === "done" && ctx.tab === "body") {
      if (ctx.queryVisible) return []
      return [
        { key: displayKey(kb.response_copy_body), word: "copy" },
        { key: displayKey(kb.response_query), word: "filter" },
        { key: displayKey(kb.pane_expand), word: "expand" },
      ]
    }
    return [{ key: displayKey(kb.pane_expand), word: "expand" }]
  }

  if (ctx.focus === "folder") {
    if (ctx.paneMode === "base") {
      if (!col) return []
      return [
        { key: displayKey(kb.request_delete), word: "delete" },
        { key: displayKey(kb.request_save), word: "save" },
      ]
    }
    if (ctx.paneMode === "browse") {
      if (!col) return []
      const toggleSegments =
        ctx.tab === "headers" ? [{ key: "Space", word: "toggle" }] : []
      if (ctx.tab === "activity") return []
      return [
        ...toggleSegments,
        { key: displayKey(kb.browse_delete), word: "revert" },
        { key: displayKey(kb.browse_revert_all), word: "revert all" },
        { key: displayKey(kb.request_save), word: "save" },
      ]
    }
    return []
  }

  return []
}
