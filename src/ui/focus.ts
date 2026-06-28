export type Focus =
  | "sidebar"
  | "urlbar"
  | "request"
  | "response"
  | "env-sidebar"
  | "env-vars"

const MAIN_FOCUS_ORDER: Focus[] = ["sidebar", "urlbar", "request", "response"]
const ENV_FOCUS_ORDER: Focus[] = ["env-sidebar", "env-vars"]

export function cycleFocus(
  current: Focus,
  delta: 1 | -1,
  view: string = "main",
): Focus {
  const order = view === "env-editor" ? ENV_FOCUS_ORDER : MAIN_FOCUS_ORDER
  const idx = order.indexOf(current)
  const next = (idx + delta + order.length) % order.length
  return order[next]!
}

export function hintForFocus(
  focus: Focus,
  mode: "inactive" | "browsing" | "editing",
  view: string = "main",
): string {
  if (view === "env-editor") {
    if (focus === "env-sidebar") {
      return "[↑/↓] select · [N] new · [C] clone · [D] delete · [Tab] next"
    }
    if (focus === "env-vars") {
      return "[↑/↓] select · [Enter] edit · [Space] toggle · [a] add · [d] delete · [Tab] next"
    }
    return "[Tab] next · [^S] save · [Esc] back"
  }
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
