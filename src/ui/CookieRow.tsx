import { MouseButton } from "@opentui/core"
import { useTheme } from "./theme"

export const COOKIE_CHEVRON_WIDTH = 2

export interface CookieRowDetail {
  label: string
  value: string
}

export interface CookieDetailsInput {
  domain?: string
  path?: string
  expires: Date | string | null
  secure: boolean
  httpOnly: boolean
  sameSite?: "strict" | "lax" | "none"
  hostOnly?: boolean
}

export function cookieNameWidth(cookies: Array<{ name: string }>): number {
  if (cookies.length === 0) return 0
  return Math.min(24, Math.max(...cookies.map(({ name }) => name.length)) + 2)
}

export function formatCookieExpiry(expires: Date | string | null): string {
  if (expires === null) return "session"
  const date = expires instanceof Date ? expires : new Date(expires)
  if (Number.isNaN(date.getTime())) return String(expires)
  return `${date.toISOString().slice(0, 16).replace("T", " ")} GMT`
}

export function cookieDetails(
  cookie: CookieDetailsInput,
  expired = false,
): CookieRowDetail[] {
  const flags = [
    cookie.secure ? "Secure" : "",
    cookie.httpOnly ? "HttpOnly" : "",
    cookie.sameSite ? `SameSite=${cookie.sameSite}` : "",
    cookie.hostOnly === undefined
      ? ""
      : cookie.hostOnly
        ? "HostOnly"
        : "Domain",
  ].filter(Boolean)

  return [
    { label: "Domain", value: cookie.domain ?? "host only" },
    { label: "Path", value: cookie.path ?? "default path" },
    {
      label: expired ? "Expired" : "Expires",
      value: formatCookieExpiry(cookie.expires),
    },
    ...(flags.length > 0 ? [{ label: "Flags", value: flags.join(" · ") }] : []),
  ]
}

export function CookieRow({
  id,
  kindLabel,
  kindColor,
  name,
  value,
  nameWidth,
  selected,
  expanded,
  hovered,
  deleted = false,
  valueColor,
  details,
  onSelect,
  onToggleExpanded,
  onHover,
  onPaneFocus,
}: {
  id: string
  kindLabel: string
  kindColor: string
  name: string
  value: string
  nameWidth: number
  selected: boolean
  expanded: boolean
  hovered: boolean
  deleted?: boolean
  valueColor?: string
  details?: CookieRowDetail[]
  onSelect: () => void
  onToggleExpanded: () => void
  onHover: (hovered: boolean) => void
  onPaneFocus?: () => void
}) {
  const theme = useTheme()
  const displayValue = deleted ? "Deleted" : value || "(empty)"
  const rowValueColor = valueColor ?? theme.textMuted
  const chevron = expanded ? "▾" : "▸"

  return (
    <box
      id={id}
      style={{
        flexDirection: "column",
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor:
          selected || hovered ? theme.backgroundElement : undefined,
      }}
      onMouseDown={(event) => {
        if (event.button !== MouseButton.LEFT) return
        onPaneFocus?.()
        onSelect()
        onToggleExpanded()
        event.stopPropagation()
      }}
      onMouseOver={() => onHover(true)}
      onMouseOut={() => onHover(false)}
    >
      <box style={{ flexDirection: "row", minWidth: 0 }}>
        <box style={{ width: COOKIE_CHEVRON_WIDTH, flexShrink: 0 }}>
          <text fg={selected ? theme.text : theme.textMuted}>{chevron}</text>
        </box>
        <box style={{ width: 10, flexShrink: 0 }}>
          <text fg={kindColor} wrapMode="none">
            {kindLabel}
          </text>
        </box>
        <box
          style={{
            width: nameWidth,
            flexShrink: 0,
            overflow: "hidden",
          }}
        >
          <text fg={theme.text} wrapMode="none" truncate>
            {name}
          </text>
        </box>
        <text
          fg={rowValueColor}
          wrapMode="none"
          truncate
          style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}
        >
          {displayValue}
        </text>
      </box>
      {expanded && details ? (
        details.map(({ label, value: detailValue }) => (
          <box
            key={label}
            style={{
              flexDirection: "row",
              paddingLeft: COOKIE_CHEVRON_WIDTH,
            }}
          >
            <text fg={theme.text} width={nameWidth} wrapMode="none">
              {label}
            </text>
            <text
              fg={label === "Value" ? rowValueColor : theme.textMuted}
              wrapMode="char"
              style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}
            >
              {detailValue}
            </text>
          </box>
        ))
      ) : expanded ? (
        <box style={{ paddingLeft: COOKIE_CHEVRON_WIDTH }}>
          <text
            fg={rowValueColor}
            wrapMode="char"
            style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}
          >
            {displayValue}
          </text>
        </box>
      ) : null}
    </box>
  )
}
