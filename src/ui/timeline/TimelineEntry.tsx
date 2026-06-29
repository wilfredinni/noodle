import type { TimelineEntry as TimelineEntryType } from "../../schema"
import { useTheme } from "../theme"
import { formatHeaders, formatStatusLine, statusColor, formatSize } from "../format"
import {
  entryMethod,
  entryStatus,
  entryTiming,
  relativeTime,
  truncateUrl,
} from "./formatTimeline"
import { methodColor } from "../formatRequest"

function formatRequestHeaders(entry: TimelineEntryType): string[] {
  const lines: string[] = []
  for (const [k, v] of Object.entries(entry.request.headers)) {
    if (v.enabled) lines.push(`${k}: ${v.value}`)
  }
  return lines.sort()
}

function formatRequestUrl(entry: TimelineEntryType): string {
  const u = entry.request.url
  const params = entry.request.params
  const enabled = Object.entries(params).filter(([, v]) => v.enabled)
  if (enabled.length === 0) return u
  const qs = enabled.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v.value)}`).join("&")
  if (u.includes("?")) return `${u}&${qs}`
  return `${u}?${qs}`
}

function authSummary(
  auth: TimelineEntryType["request"]["auth"],
): string | null {
  if (!auth || auth.type === "none") return null
  if (auth.type === "bearer") return "Bearer token"
  return `Basic ${auth.user}:****`
}

export function TimelineEntry({
  id,
  entry,
  isSelected,
  isExpanded,
  containerWidth,
}: {
  id?: string
  entry: TimelineEntryType
  isSelected: boolean
  isExpanded: boolean
  containerWidth: number
}) {
  const theme = useTheme()
  const status = entryStatus(entry)
  const hasError = entry.error !== undefined

  const prefix = isExpanded ? "▾" : "▸"
  const rowBg = isSelected ? theme.backgroundElement : undefined
  const rowFg = isSelected ? theme.text : theme.textMuted

  const method = entryMethod(entry)
  const methodStr = method.padEnd(5)
  const statusStr = status !== null ? (status === 0 ? "ERR " : `${status} `) : "--- "
  const urlStr = formatRequestUrl(entry)
  const timingStr = hasError ? "ERR" : entryTiming(entry)
  const reltimeStr = relativeTime(entry.timestamp)

  const ROW_PADDING = 2
  const FIXED_ELEMENTS = 22
  const urlMaxLength = containerWidth > 0
    ? Math.max(10, containerWidth - ROW_PADDING - FIXED_ELEMENTS)
    : 999

  return (
    <box id={id} style={{ flexDirection: "column", backgroundColor: rowBg, overflow: "hidden" }}>
      <box
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingLeft: 1,
          paddingRight: 1,
          overflow: "hidden",
        }}
      >
        <box
          style={{
            flexDirection: "row",
            flexShrink: 1,
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          <text fg={rowFg}>{prefix} </text>
          <text fg={methodColor(method, theme)}>{methodStr}</text>
          {status !== null ? (
            <text fg={statusColor(status, theme)}>{statusStr}</text>
          ) : (
            <text fg={theme.textMuted}>{statusStr}</text>
          )}
          <text
            fg={theme.text}
            wrapMode="none"
            style={{ flexShrink: 1, minWidth: 10 }}
          >
            {truncateUrl(urlStr, urlMaxLength)}
          </text>
        </box>
        <text fg={hasError ? theme.error : theme.textMuted}>
          {timingStr + " " + reltimeStr}
        </text>
      </box>

      {isExpanded && (
        <box
          style={{
            flexDirection: "column",
            paddingLeft: 2,
            paddingRight: 1,
            gap: 0,
          }}
        >
          <box
            border={["bottom"]}
            borderColor={theme.borderSubtle}
            style={{ paddingLeft: 1 }}
          >
            <text fg={theme.text}>Request</text>
          </box>
          <box style={{ flexDirection: "column", gap: 0, paddingLeft: 2 }}>
            <text fg={theme.text}>
              {" "}
              {entryMethod(entry)} {formatRequestUrl(entry)}
            </text>
            {authSummary(entry.request.auth) && (
              <text fg={theme.textMuted}>
                {" "}
                {authSummary(entry.request.auth)}
              </text>
            )}
            {formatRequestHeaders(entry).map((h) => (
              <text key={h} fg={theme.textMuted}> {h}</text>
            ))}
            {entry.request.body && (
              <text fg={theme.text}> {entry.request.body}</text>
            )}
            {entry.envName && (
              <text fg={theme.info}> env: {entry.envName}</text>
            )}
          </box>
          <box
            border={["bottom"]}
            borderColor={theme.borderSubtle}
            style={{ paddingLeft: 1 }}
          >
            <text fg={theme.text}>Response</text>
          </box>
          <box style={{ flexDirection: "column", gap: 0, paddingLeft: 2 }}>
            {(() => {
              const r = entry.response
              if (r) {
                return (
                  <>
                    <text fg={theme.text}>
                      {" "}
                      {formatStatusLine(r) + " · " + formatSize(r.size)}
                    </text>
                    {formatHeaders(r).map(({ key, value }) => (
                      <text key={key} fg={theme.textMuted}> {key}: {value}</text>
                    ))}
                    {r.body && (
                      <text fg={theme.text}>
                        {" "}
                          {r.body.length > 1000
                            ? r.body.slice(0, 1000) + "..."
                          : r.body}
                      </text>
                    )}
                  </>
                )
              }
              if (entry.error) {
                return (
                  <text fg={theme.error}> {entry.error.message}</text>
                )
              }
              return (
                <text fg={theme.textMuted}> No response</text>
              )
            })()}
          </box>
        </box>
      )}
    </box>
  )
}
