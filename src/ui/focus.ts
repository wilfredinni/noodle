export type Focus = "sidebar" | "urlbar" | "request" | "response"

const FOCUS_ORDER: Focus[] = ["sidebar", "urlbar", "request", "response"]

export function cycleFocus(current: Focus, delta: 1 | -1): Focus {
  const idx = FOCUS_ORDER.indexOf(current)
  const next = (idx + delta + FOCUS_ORDER.length) % FOCUS_ORDER.length
  return FOCUS_ORDER[next]!
}

export function hintForFocus(
  focus: Focus,
  mode: "inactive" | "browsing" | "editing",
): string {
  if (focus === "sidebar") {
    return "[↑/↓] select · [e] edit · [s] send · [w] save · [Tab] → URL Bar"
  }
  if (focus === "urlbar") {
    return "[Tab] → Request"
  }
  if (focus === "request") {
    if (mode === "browsing") {
      return "[↑/↓/Enter] edit · [d] revert · [R] revert all · [Esc] back · [Tab] → Response"
    }
    if (mode === "editing") {
      return "[Enter] commit · [Esc] cancel"
    }
    return "[e] enter edit · [s] send · [w] save · [Tab] → Response"
  }
  // focus === "response"
  return "[Tab] → Sidebar"
}
