import { useTheme } from "./theme"
import type { Keybinds } from "./keybind"
import { displayKey } from "./keybind"
import type { SendState } from "./sendState"
import type { SaveState } from "./saveState"
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
  const right = `[${displayKey(kb.request_send)}] send · [${displayKey(kb.request_save)}] save · [${displayKey(kb.request_new)}] new · [${displayKey(kb.request_edit_overlay)}] edit · [${displayKey(kb.request_clone)}] clone · [${displayKey(kb.request_delete)}] delete · [${kb.help_toggle}] help`

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
}) {
  const theme = useTheme()
  const sections = statusBarText(input)

  const sk = input.saveState.kind

  const rightSegments = sections.right.split(" · ").map((seg) => {
    const s = seg.replace(/[[\]]/g, "")
    const sp = s.indexOf(" ")
    return sp > -1
      ? { key: s.slice(0, sp), word: s.slice(sp + 1) }
      : { key: s, word: "" }
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

  const isEnvEditor = input.view === "env-editor"
  const envEditorSegments = [
    { key: "Esc", word: "back" },
    { key: displayKey(input.kb.env_new), word: "new" },
    { key: displayKey(input.kb.env_save), word: "save" },
    { key: displayKey(input.kb.env_clone), word: "clone" },
    { key: displayKey(input.kb.env_delete), word: "delete" },
  ]

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
      <box style={{ flexDirection: "row" }}>
        {(isEnvEditor ? envEditorSegments : rightSegments).map((seg, i) => (
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
