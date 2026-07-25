import { useTerminalDimensions } from "@opentui/react"
import { useTheme } from "./theme"
import type { Keybinds } from "./keybind"
import { displayKey } from "./keybind"
import type { SendState } from "./sendState"
import type { SaveState } from "./saveState"
import { Badge } from "./Badge"
import type { Focus } from "./focus"

export interface StatusBarSections {
  left: string
  center: string
  right: string
}

function fitSegments(
  segments: Array<{ key: string; word: string }>,
  maxChars: number,
): Array<{ key: string; word: string }> {
  const visible: Array<{ key: string; word: string }> = []
  let usedChars = 0

  for (const seg of segments) {
    const segLen =
      seg.key.length +
      (seg.word ? 1 + seg.word.length : 0) +
      (visible.length > 0 ? 3 : 0)
    if (usedChars + segLen > maxChars) break
    visible.push(seg)
    usedChars += segLen
  }

  return visible
}

function urlPath(url: string): string {
  if (url === "") return ""
  try {
    return new URL(url).pathname || url
  } catch {
    return url
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function footerStatusLine(
  status: number,
  statusText: string,
  timeMs: number,
  bodyLen: number,
): string {
  const ms = Math.round(timeMs)
  const size = formatSize(bodyLen)
  if (statusText === "") return `${status} · ${ms}ms · ${size}`
  return `${status} ${statusText} · ${ms}ms · ${size}`
}

export function statusBarText(input: {
  method: string
  url: string
  isDirty: boolean
  sendState: SendState
  envLabel: string
  saveState: SaveState
  kb: Keybinds
  spinnerFrame?: string
}): StatusBarSections {
  const {
    method,
    url,
    isDirty,
    sendState,
    envLabel,
    saveState,
    kb,
    spinnerFrame = "⠋",
  } = input

  // ── LEFT: request/response status ──────────────────
  let left: string
  const sendStatus = sendState.status

  if (sendStatus === "sending") {
    const path = urlPath(sendState.request.url)
    left = `${spinnerFrame} ${sendState.request.method} ${path}...`
  } else if (sendStatus === "done") {
    const res = sendState.response
    const bodyLen = new TextEncoder().encode(res.body).length
    left = footerStatusLine(res.status, res.statusText, res.timeMs, bodyLen)
  } else if (sendStatus === "error") {
    left = `✗ ${sendState.error.message}`
  } else {
    // idle
    if (method === "" && url === "") {
      left = ""
    } else {
      const path = urlPath(url)
      left = `${method} ${path}`
    }
  }

  // ── CENTER: env + dirty + save flash ───────────────
  let center: string
  if (saveState.kind === "success") {
    center = `✓ ${saveState.message}`
  } else if (saveState.kind === "error") {
    center = `✗ ${saveState.message}`
  } else if (envLabel === "" || envLabel === "(no env)") {
    center = "(no env)"
  } else {
    center = isDirty ? `● ${envLabel} •` : `● ${envLabel}`
  }

  // ── RIGHT: pinned hints (statusBarText is kept for backward compat;
  // StatusBar uses getContextualSegments instead) ──────
  const right = ""

  void kb
  return { left, center, right }
}

type PaneMode = "base" | "browse" | "edit"
type CollectionMode = "collection" | "browse" | "empty" | "invalid"

export function getContextualSegments(input: {
  focus: Focus
  paneMode: PaneMode
  view: "main" | "env-editor"
  collectionMode: CollectionMode
  sendState: SendState
  kb: Keybinds
  overlayActive: boolean
  tab?: string
}): Array<{ key: string; word: string }> {
  const {
    focus,
    paneMode,
    view,
    collectionMode,
    sendState,
    kb,
    overlayActive,
    tab,
  } = input
  if (overlayActive) return []

  const col = collectionMode === "collection"

  if (view === "env-editor") {
    if (!col) return []
    if (focus === "env-sidebar") {
      return [
        { key: displayKey(kb.env_new), word: "new" },
        { key: displayKey(kb.env_delete), word: "delete" },
        { key: displayKey(kb.env_clone), word: "clone" },
      ]
    }
    if (focus === "env-header") {
      return [
        { key: displayKey(kb.env_save), word: "save" },
        { key: displayKey(kb.env_new), word: "new" },
      ]
    }
    if (focus === "env-vars" && paneMode === "browse") {
      return [
        { key: "Space", word: "toggle" },
        { key: displayKey(kb.browse_delete), word: "revert" },
        { key: displayKey(kb.env_save), word: "save" },
      ]
    }
    if (focus === "env-vars" && paneMode === "edit") {
      return [{ key: displayKey(kb.env_save), word: "save" }]
    }
    return []
  }

  // ── main view ──

  if (focus === "sidebar") {
    if (!col) return []
    return [
      { key: displayKey(kb.request_save), word: "save" },
      { key: displayKey(kb.request_new), word: "new" },
      { key: displayKey(kb.folder_new), word: "new folder" },
      { key: displayKey(kb.request_delete), word: "delete" },
      { key: displayKey(kb.request_clone), word: "clone" },
    ]
  }

  if (focus === "urlbar") {
    if (!col) return []
    return [{ key: displayKey(kb.request_save), word: "save" }]
  }

  if (focus === "request") {
    if (paneMode === "base") {
      if (!col) return []
      return [{ key: displayKey(kb.request_save), word: "save" }]
    }
    if (paneMode === "browse") {
      if (!col) return []
      const toggleSegments =
        tab === "headers" || tab === "params" || tab === "body"
          ? [{ key: "Space", word: "toggle" }]
          : []
      return [
        ...toggleSegments,
        { key: displayKey(kb.browse_delete), word: "revert" },
        { key: displayKey(kb.browse_revert_all), word: "revert all" },
        { key: displayKey(kb.request_save), word: "save" },
      ]
    }
    return []
  }

  if (focus === "response") {
    if (sendState.status === "done" && tab === "body") {
      return [
        { key: displayKey(kb.response_copy_body), word: "copy" },
        { key: displayKey(kb.response_query), word: "filter" },
      ]
    }
    return []
  }

  if (focus === "folder") {
    if (paneMode === "base") {
      if (!col) return []
      return [
        { key: displayKey(kb.request_save), word: "save" },
        { key: displayKey(kb.request_delete), word: "delete" },
      ]
    }
    if (paneMode === "browse") {
      if (!col) return []
      const toggleSegments =
        tab === "headers" ? [{ key: "Space", word: "toggle" }] : []
      if (tab === "activity") return []
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

export function StatusBar(input: {
  method: string
  url: string
  isDirty: boolean
  sendState: SendState
  envLabel: string
  envColor?: string
  saveState: SaveState
  kb: Keybinds
  spinnerFrame?: string
  view?: "main" | "env-editor"
  envStats?: string
  jumpMode?: boolean
  focus?: Focus
  paneMode?: PaneMode
  collectionMode?: CollectionMode
  overlayActive?: boolean
  tab?: string
}) {
  const theme = useTheme()

  const view = input.view ?? "main"
  const jumpMode = input.jumpMode ?? false
  const focus = input.focus ?? "sidebar"
  const paneMode = input.paneMode ?? "base"
  const collectionMode = input.collectionMode ?? "collection"
  const overlayActive = input.overlayActive ?? false

  const contextual = getContextualSegments({
    focus,
    paneMode,
    view,
    collectionMode,
    sendState: input.sendState,
    kb: input.kb,
    overlayActive,
    tab: input.tab,
  })

  const envText =
    input.envLabel === "" || input.envLabel === "(no env)"
      ? "no env"
      : input.isDirty
        ? `● ${input.envLabel} •`
        : `● ${input.envLabel}`

  const envFg = input.envLabel.includes("(load failed")
    ? theme.error
    : input.envLabel === "" || input.envLabel === "(no env)"
      ? theme.textMuted
      : input.envColor !== undefined
        ? ((theme as unknown as Record<string, string>)[input.envColor] ??
          theme.info)
        : theme.info

  const isEnvEditor = view === "env-editor"

  const jumpSegments = [
    { key: "Type key", word: "to jump" },
    { key: "Esc", word: "dismiss" },
  ]

  const { width: termWidth = 100 } = useTerminalDimensions()

  const sendPinned =
    view === "main" &&
    collectionMode === "collection" &&
    !overlayActive &&
    !jumpMode
      ? [{ key: displayKey(input.kb.request_send), word: "send" }]
      : []

  let pinnedWidth = 0
  for (const seg of sendPinned) {
    pinnedWidth += seg.key.length + (seg.word ? 1 + seg.word.length : 0) + 3
  }

  const segments = jumpMode ? jumpSegments : contextual

  const leftWidth = isEnvEditor
    ? (input.envStats?.length || 10) + 4
    : envText.length + 4
  const maxShortcutChars = Math.max(0, termWidth - leftWidth - pinnedWidth)
  const visibleSegments = jumpMode
    ? segments
    : fitSegments(segments, maxShortcutChars)

  const allSegments = [...sendPinned, ...visibleSegments]

  return (
    <box
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        flexShrink: 0,
        paddingY: 0,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <box style={{ flexDirection: "row" }}>
        {isEnvEditor ? (
          <Badge bg={theme.backgroundElement} fg={theme.info}>
            {input.envStats || "Env Editor"}
          </Badge>
        ) : (
          <text fg={envFg}>{envText}</text>
        )}
      </box>
      <box style={{ flexDirection: "row", alignItems: "center" }}>
        {allSegments.map((seg, i) => (
          <box key={i} style={{ flexDirection: "row" }}>
            <text fg={theme.text}>{seg.key}</text>
            {seg.word ? <text fg={theme.textMuted}> {seg.word}</text> : null}
            {i < allSegments.length - 1 && (
              <text fg={theme.textMuted}> · </text>
            )}
          </box>
        ))}
      </box>
    </box>
  )
}
