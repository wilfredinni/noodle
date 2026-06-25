export type Focus = "sidebar" | "url" | "request" | "response"

const FOCUS_ORDER: Focus[] = ["sidebar", "url", "request", "response"]

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
    return "[↑/↓] select · [e] edit · [s] send · [w] save · [Tab] → URL"
  }
  if (focus === "url") {
    if (mode === "browsing") {
      return "[e/Enter] edit · [Esc] back · [Tab] → Request"
    }
    if (mode === "editing") {
      return "[Enter] commit · [Esc] cancel"
    }
    return "[e] enter edit · [Tab] → Request"
  }
  if (focus === "request") {
    if (mode === "browsing") {
      return "[←/→] tabs · [↑/↓/Enter] edit · [d] revert · [R] revert all · [Esc] back · [Tab] → Response"
    }
    if (mode === "editing") {
      return "[Enter] commit · [Esc] cancel"
    }
    return "[e] enter edit · [s] send · [w] save · [Tab] → Response"
  }
  // focus === "response"
  return "[Tab] → Sidebar"
}
