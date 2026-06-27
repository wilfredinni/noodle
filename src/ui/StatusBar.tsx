import { useTheme } from "./theme"
import type { Keybinds } from "./keybind"
import { displayKey } from "./keybind"
import type { SendState } from "./sendState"
import type { SaveState } from "./saveState"
import { methodColor } from "./formatRequest"
import { statusColor } from "./format"
import type { Method } from "../schema"
import { Badge } from "./Badge"

export interface StatusBarSections {
  left: string
  center: string
  right: string
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

  // ── RIGHT: global hints ────────────────────────────
  const right = `[${kb.request_send}] send · [${displayKey(kb.request_save)}] save · [${displayKey(kb.layout_toggle)}] layout · [${kb.focus_next}] focus · [${kb.help_toggle}] help · [^c] quit`

  return { left, center, right }
}

export function StatusBar(input: {
  method: string
  url: string
  isDirty: boolean
  sendState: SendState
  envLabel: string
  saveState: SaveState
  kb: Keybinds
  spinnerFrame?: string
}) {
  const theme = useTheme()
  const sections = statusBarText(input)
  const sendStatus = input.sendState.status

  // Determine LEFT color
  let leftColor = theme.textMuted
  if (sendStatus === "done") {
    leftColor = statusColor(input.sendState.response.status, theme)
  } else if (sendStatus === "error") {
    leftColor = theme.error
  } else if (sendStatus === "sending") {
    leftColor = theme.info
  } else if (input.method !== "") {
    leftColor = methodColor(input.method as Method, theme)
  }

  // Determine CENTER color
  let centerColor = theme.info
  const sk = input.saveState.kind
  if (sk === "success") {
    centerColor = theme.success
  } else if (sk === "error") {
    centerColor = theme.error
  } else if (input.envLabel === "" || input.envLabel === "(no env)") {
    centerColor = theme.textMuted
  }

  const isLeftBadge = sendStatus === "done" || sendStatus === "error"
  const leftParts = sections.left.split(" · ")
  const isCenterFlash = sk === "success" || sk === "error"
  const isCenterEmpty =
    input.envLabel === "" || input.envLabel === "(no env)"

  const spaceIdx = sections.left.indexOf(" ")
  const leftMethod =
    sendStatus === "idle" && spaceIdx > -1
      ? sections.left.slice(0, spaceIdx)
      : ""
  const leftPath =
    sendStatus === "idle" && spaceIdx > -1
      ? sections.left.slice(spaceIdx + 1)
      : ""

  const rightSegments = sections.right.split(" · ").map((seg) => {
    const s = seg.replace(/[[\]]/g, "")
    const sp = s.indexOf(" ")
    return sp > -1 ? { key: s.slice(0, sp), word: s.slice(sp + 1) } : { key: s, word: "" }
  })

  return (
    <box
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        flexShrink: 0,
        paddingY: 1,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <box style={{ flexDirection: "row" }}>
        {isLeftBadge && leftParts[0] !== "" ? (
          <>
            <Badge bg={leftColor} fg={theme.background}>
              {leftParts[0]}
            </Badge>
            {leftParts[1] ? (
              <Badge bg={theme.info} fg={theme.background}>
                {leftParts[1]}
              </Badge>
            ) : null}
            {leftParts[2] ? (
              <Badge bg={theme.backgroundElement} fg={theme.text}>
                {leftParts[2]}
              </Badge>
            ) : null}
          </>
        ) : leftMethod !== "" ? (
          <>
            <Badge bg={leftColor} fg={theme.background}>
              {leftMethod}
            </Badge>
            <Badge bg={theme.backgroundElement} fg={theme.text}>
              {leftPath}
            </Badge>
          </>
        ) : sections.left !== "" ? (
          <text fg={leftColor}>{sections.left}</text>
        ) : (
          <text fg={leftColor}>{sections.left}</text>
        )}
      </box>
      {isCenterFlash ? (
        <Badge bg={theme.primary} fg={theme.background}>
          {sections.center}
        </Badge>
      ) : isCenterEmpty ? (
        <text fg={theme.textMuted}>{sections.center}</text>
      ) : (
        <Badge bg={theme.backgroundElement} fg={centerColor}>
          {sections.center}
        </Badge>
      )}
      <box style={{ flexDirection: "row" }}>
        {rightSegments.map((seg, i) => (
          <box key={i} style={{ flexDirection: "row" }}>
            {i > 0 ? <text fg={theme.textMuted}> · </text> : null}
            <text fg={theme.primary}>{seg.key}</text>
            <text fg={theme.textMuted}> {seg.word}</text>
          </box>
        ))}
      </box>
    </box>
  )
}
