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
  const picker = " · [t] pick theme"
  if (focus === "sidebar") {
    return "[↑/↓] select · [e] edit · [s] send · [w] save · [Tab] → URL Bar" + picker
  }
  if (focus === "urlbar") {
    return "[Tab] → Request" + picker
  }
  if (focus === "request") {
    if (mode === "browsing") {
      return "[↑/↓/Enter] edit · [d] revert · [R] revert all · [Esc] back · [Tab] → Response" + picker
    }
    if (mode === "editing") {
      return "[Enter] commit · [Esc] cancel"
    }
    return "[e] enter edit · [s] send · [w] save · [Tab] → Response" + picker
  }
  // focus === "response"
  return "[↑/↓/PgUp/PgDn] scroll · [Tab] → Sidebar" + picker
}
