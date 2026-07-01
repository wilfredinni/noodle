export type Focus =
  | "sidebar"
  | "urlbar"
  | "request"
  | "response"
  | "folder"
  | "env-sidebar"
  | "env-header"
  | "env-vars"

export type ExpandTarget = "request" | "response" | null

export function toggleExpand(
  current: ExpandTarget,
  focus: "request" | "response",
): ExpandTarget {
  if (current === null) return focus
  if (current === focus) return null
  return focus
}

const MAIN_FOCUS_ORDER: Focus[] = ["sidebar", "urlbar", "request", "response"]
const ENV_FOCUS_ORDER: Focus[] = ["env-sidebar", "env-header", "env-vars"]

export function cycleFocus(
  current: Focus,
  delta: 1 | -1,
  view: string = "main",
  expanded?: ExpandTarget,
  folderView = false,
): Focus {
  if (folderView && view === "main") {
    const order: Focus[] = ["sidebar", "folder"]
    const idx = order.indexOf(current)
    const idx2 = idx < 0 ? 0 : idx
    return order[(idx2 + delta + order.length) % order.length]!
  }
  const order = view === "env-editor" ? ENV_FOCUS_ORDER : MAIN_FOCUS_ORDER
  const idx = order.indexOf(current)
  let next = (idx + delta + order.length) % order.length
  const candidate = order[next]!

  if (expanded && view === "main") {
    const hiddenFocus: Focus = expanded === "request" ? "response" : "request"
    if (candidate === hiddenFocus) {
      next = (next + delta + order.length) % order.length
      return order[next]!
    }
  }

  return candidate
}

export function hintForFocus(
  focus: Focus,
  mode: "inactive" | "browsing" | "editing",
  view: string = "main",
): string {
  if (view === "env-editor") {
    if (focus === "env-sidebar") {
      return "[↑/↓] select · [^N] new env · [^W] delete · [^K] clone · [Tab] next"
    }
    if (focus === "env-header") {
      return "[Tab] · [Enter] toggle field · [^N] new env · [^S] save · [^K] clone · [^W] delete env"
    }
    if (focus === "env-vars") {
      return "[↑/↓] navigate · [Enter] edit · [^x] toggle · [^d] delete · [^N] new env · [^K] clone · [^W] delete env"
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
  if (focus === "folder") {
    return "[^S] save name · [Tab] next"
  }
  // response
  return "[↑/↓/PgUp/PgDn] scroll · [Tab] next"
}
