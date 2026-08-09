export type Focus =
  | "sidebar"
  | "urlbar"
  | "request"
  | "response"
  | "folder"
  | "env-sidebar"
  | "env-header"
  | "env-vars"
  | "settings-sidebar"
  | "settings-content"

export type ExpandTarget = "request" | "response" | null
export type UrlBarSubFocus = "select" | "text"

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
const SETTINGS_FOCUS_ORDER: Focus[] = ["settings-sidebar", "settings-content"]

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
  const order =
    view === "env-editor"
      ? ENV_FOCUS_ORDER
      : view === "settings"
        ? SETTINGS_FOCUS_ORDER
        : MAIN_FOCUS_ORDER
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
