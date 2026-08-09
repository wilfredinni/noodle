import { MouseButton } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { useState } from "react"
import { useTheme } from "./theme"
import type { Keybinds } from "./keybind"
import { displayKey } from "./keybind"
import type { SendState } from "./sendState"
import type { SaveState } from "./saveState"
import type { HintSegment } from "./keybindingHints"
import type { CollectionMode } from "../collectionPath"
import type { AppView } from "./appState"

const HINT_HORIZONTAL_PADDING = 2
const HINT_ITEM_GAP = 1
const MAX_CONTEXTUAL_HINTS = 3

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

function segmentsWidth(segments: HintSegment[]): number {
  return segments.reduce(
    (width, seg, i) =>
      width +
      seg.key.length +
      (seg.word ? 1 + seg.word.length : 0) +
      HINT_HORIZONTAL_PADDING +
      (i > 0 ? HINT_ITEM_GAP : 0),
    0,
  )
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
  kb: Keybinds
  view?: AppView
  jumpMode?: boolean
  collectionMode?: CollectionMode
  overlayActive?: boolean
  globalHints: HintSegment[]
  footerHints: HintSegment[]
  sendCommand?: string
  onHintActivate?: (command: string) => void
}) {
  const theme = useTheme()
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null)

  const view = input.view ?? "main"
  const jumpMode = input.jumpMode ?? false
  const collectionMode = input.collectionMode ?? "collection"
  const overlayActive = input.overlayActive ?? false

  const { width: termWidth = 100 } = useTerminalDimensions()
  const transient = jumpMode || overlayActive
  const showHintLabels = termWidth >= 100 || transient
  const displayHints = (segments: HintSegment[]) =>
    showHintLabels
      ? segments
      : segments.map((segment) => ({ ...segment, word: "" }))

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

  const expandSegment = transient
    ? []
    : input.footerHints
        .filter((segment) => segment.command === "request.expand-toggle")
        .slice(0, 1)
  const contextualSource = input.footerHints.filter(
    (segment) => segment.command !== "request.expand-toggle",
  )
  const expandWidth = segmentsWidth(expandSegment)
  const sendWidth = segmentsWidth(sendSegment)
  const visibleSendSegment =
    sendWidth <=
    Math.max(
      0,
      termWidth -
        2 -
        expandWidth -
        (expandSegment.length > 0 ? HINT_ITEM_GAP : 0),
    )
      ? sendSegment
      : []
  const visibleSendWidth = segmentsWidth(visibleSendSegment)
  const transientHints = transient ? displayHints(input.globalHints) : []
  const contextualHints = displayHints(
    contextualSource.slice(0, MAX_CONTEXTUAL_HINTS),
  )
  const commandsHint = displayHints([
    {
      key: displayKey(input.kb.command_palette),
      word: "commands",
      command: "app.command-palette",
    },
  ])
  const leftBudget = Math.max(
    0,
    termWidth -
      2 -
      expandWidth -
      visibleSendWidth -
      (expandSegment.length > 0 ? HINT_ITEM_GAP : 0) -
      (visibleSendSegment.length > 0 ? HINT_ITEM_GAP : 0),
  )

  let showCommands =
    expandSegment.length > 0 ||
    collectionMode !== "collection" ||
    input.footerHints.length > MAX_CONTEXTUAL_HINTS
  let visibleContextual = fitSegments(contextualHints, leftBudget)
  if (visibleContextual.length < contextualHints.length) showCommands = true

  const commandsWidth = segmentsWidth(commandsHint)
  const visibleCommands = showCommands && commandsWidth <= leftBudget
  if (visibleCommands) {
    visibleContextual = fitSegments(
      contextualHints,
      Math.max(
        0,
        leftBudget -
          commandsWidth -
          (contextualHints.length > 0 ? HINT_ITEM_GAP : 0),
      ),
    )
  }

  const visibleTransient = fitSegments(transientHints, termWidth - 2)
  const leftSegments = transient
    ? visibleTransient
    : [
        ...expandSegment,
        ...visibleContextual,
        ...(visibleCommands ? commandsHint : []),
      ]

  const renderSegment = (seg: HintSegment, id: string) => (
    <box
      key={id}
      style={{
        flexDirection: "row",
        flexShrink: 0,
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor:
          seg.command && input.onHintActivate && hoveredSegment === id
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
          ? () => setHoveredSegment(id)
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
  )

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
      <box style={{ flexDirection: "row", alignItems: "center", gap: 1 }}>
        {leftSegments.map((seg, i) =>
          renderSegment(seg, `left-${seg.command ?? seg.key}-${i}`),
        )}
      </box>
      <box
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: HINT_ITEM_GAP,
        }}
      >
        {visibleSendSegment.map((seg, i) =>
          renderSegment(seg, `send-${seg.command ?? seg.key}-${i}`),
        )}
      </box>
    </box>
  )
}
