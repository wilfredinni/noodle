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
    return "[↑/↓] select · [s] send · [w] save · [Tab] next"
  }
  if (focus === "urlbar") {
    return "[Tab] next · [s] send · [w] save"
  }
  if (focus === "request") {
    if (mode === "inactive") {
      return "[Enter] edit · [s] send · [w] save · [Tab] next"
    }
    if (mode === "browsing") {
      return "[↑/↓/Enter] edit · [Esc] back · [d] revert · [R] revert all"
    }
    // editing
    return "[Enter] commit · [Esc] cancel"
  }
  // response
  return "[↑/↓/PgUp/PgDn] scroll · [Tab] next"
}
