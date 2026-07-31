import { MouseButton } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { useState } from "react"
import { useTheme } from "./theme"
import type { Keybinds } from "./keybind"
import { displayKey } from "./keybind"
import type { SendState } from "./sendState"
import type { SaveState } from "./saveState"
import type { HintSegment } from "./keybindingHints"
import type { CollectionMode } from "../app/main"

const HINT_HORIZONTAL_PADDING = 2
const HINT_ITEM_GAP = 1

export interface StatusBarSections {
  left: string
  center: string
  right: string
}

function fitSegments(
  segments: HintSegment[],
  maxChars: number,
  trailingGap = 0,
): HintSegment[] {
  const visible: HintSegment[] = []
  let usedChars = 0

  for (const seg of segments) {
    const segLen =
      seg.key.length +
      (seg.word ? 1 + seg.word.length : 0) +
      HINT_HORIZONTAL_PADDING +
      (visible.length > 0 ? HINT_ITEM_GAP : trailingGap)
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

  // ── CENTER: env + save flash ───────────────────────
  let center: string
  if (saveState.kind === "success") {
    center = `✓ ${saveState.message}`
  } else if (saveState.kind === "error") {
    center = `✗ ${saveState.message}`
  } else if (envLabel === "" || envLabel === "(no env)") {
    center = "(no env)"
  } else {
    center = `● ${envLabel}`
  }

  // ── RIGHT: pinned hints (statusBarText is kept for backward compat) ──
  const right = ""

  void isDirty
  void kb
  return { left, center, right }
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
  collectionMode?: CollectionMode
  overlayActive?: boolean
  footerHints: HintSegment[]
  sendCommand?: string
  onEnvironmentActivate?: () => void
  onHintActivate?: (command: string) => void
}) {
  const theme = useTheme()
  const [hoveringEnvironment, setHoveringEnvironment] = useState(false)
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null)

  const view = input.view ?? "main"
  const jumpMode = input.jumpMode ?? false
  const collectionMode = input.collectionMode ?? "collection"
  const overlayActive = input.overlayActive ?? false

  const contextual = input.footerHints

  const envText =
    input.envLabel === "" || input.envLabel === "(no env)"
      ? "no env"
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

  const jumpSegments: HintSegment[] = [
    { key: "Type key", word: "to jump" },
    { key: "Esc", word: "dismiss" },
  ]

  const { width: termWidth = 100 } = useTerminalDimensions()

  const sendSegment =
    view === "main" &&
    collectionMode === "collection" &&
    !overlayActive &&
    !jumpMode &&
    input.sendCommand
      ? [
          {
            key: displayKey(input.kb.request_send),
            word: "send",
            command: input.sendCommand,
          },
        ]
      : []

  let sendWidth = 0
  for (const seg of sendSegment) {
    sendWidth +=
      seg.key.length +
      (seg.word ? 1 + seg.word.length : 0) +
      HINT_HORIZONTAL_PADDING +
      (sendWidth > 0 ? HINT_ITEM_GAP : 0)
  }

  const segments = jumpMode ? jumpSegments : contextual

  const leftWidth = isEnvEditor
    ? (input.envStats?.length || 10) + 4
    : envText.length + 4
  const maxShortcutChars = Math.max(0, termWidth - leftWidth - sendWidth)
  const visibleSegments = jumpMode
    ? segments
    : fitSegments(
        segments,
        maxShortcutChars,
        sendSegment.length > 0 ? HINT_ITEM_GAP : 0,
      )

  const allSegments = [...visibleSegments, ...sendSegment]

  return (
    <box
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        flexShrink: 0,
        backgroundColor: theme.backgroundPanel,
        paddingY: 0,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <box
        style={{
          flexDirection: "row",
          paddingLeft: !isEnvEditor ? 1 : undefined,
          paddingRight: !isEnvEditor ? 1 : undefined,
          backgroundColor:
            !isEnvEditor && hoveringEnvironment
              ? theme.backgroundElement
              : undefined,
        }}
        onMouseDown={(event) => {
          if (event.button === MouseButton.LEFT && !isEnvEditor) {
            setHoveringEnvironment(false)
            input.onEnvironmentActivate?.()
          }
        }}
        onMouseOver={
          !isEnvEditor && input.onEnvironmentActivate
            ? () => setHoveringEnvironment(true)
            : undefined
        }
        onMouseOut={
          !isEnvEditor && input.onEnvironmentActivate
            ? () => setHoveringEnvironment(false)
            : undefined
        }
      >
        {isEnvEditor ? (
          <text fg={theme.info} selectable={false}>
            {input.envStats || "Env Editor"}
          </text>
        ) : (
          <text fg={envFg} selectable={false}>
            {envText}
          </text>
        )}
      </box>
      <box
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: HINT_ITEM_GAP,
        }}
      >
        {allSegments.map((seg, i) => (
          <box
            key={i}
            style={{
              flexDirection: "row",
              paddingLeft: 1,
              paddingRight: 1,
              backgroundColor:
                seg.command && input.onHintActivate && hoveredSegment === i
                  ? theme.backgroundElement
                  : undefined,
            }}
            onMouseDown={(event) => {
              if (event.button === MouseButton.LEFT && seg.command) {
                setHoveredSegment(null)
                input.onHintActivate?.(seg.command)
              }
            }}
            onMouseOver={
              seg.command && input.onHintActivate
                ? () => setHoveredSegment(i)
                : undefined
            }
            onMouseOut={
              seg.command && input.onHintActivate
                ? () => setHoveredSegment(null)
                : undefined
            }
          >
            <text fg={theme.text} selectable={false}>
              {seg.key}
            </text>
            {seg.word ? (
              <text fg={theme.textMuted} selectable={false}>
                {` ${seg.word}`}
              </text>
            ) : null}
          </box>
        ))}
      </box>
    </box>
  )
}
