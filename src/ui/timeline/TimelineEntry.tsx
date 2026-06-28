import type { TimelineEntry as TimelineEntryType } from "../../schema"
import { useTheme } from "../theme"
import { LeftBar } from "../borders"
import { formatHeaders, formatStatusLine, statusColor } from "../format"
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
}: {
  id?: string
  entry: TimelineEntryType
  isSelected: boolean
  isExpanded: boolean
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

  return (
    <box id={id} style={{ flexDirection: "column", backgroundColor: rowBg }}>
      <box
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingLeft: 1,
          paddingRight: 1,
          overflow: "hidden",
        }}
      >
        <text wrapMode="none" style={{ flexShrink: 1, minWidth: 0 }}>
          <span fg={rowFg}>{prefix} </span>
          <span fg={methodColor(method, theme)}>{methodStr}</span>
          {status !== null ? (
            <span fg={statusColor(status, theme)}>{statusStr}</span>
          ) : (
            <span fg={theme.textMuted}>{statusStr}</span>
          )}
          <span fg={theme.text}>{truncateUrl(urlStr, 30)}</span>
        </text>
        <text>
          <span fg={hasError ? theme.error : theme.textMuted}>
            {timingStr + " " + reltimeStr}
          </span>
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
          <box style={{ flexDirection: "column", gap: 0 }}>
            <box
              border={[...LeftBar.border]}
              customBorderChars={LeftBar.customBorderChars}
              borderColor={theme.borderSubtle}
            >
              <text fg={theme.text}>
                {" "}
                {entryMethod(entry)} {formatRequestUrl(entry)}
              </text>
            </box>
            {authSummary(entry.request.auth) && (
              <box
                border={[...LeftBar.border]}
                customBorderChars={LeftBar.customBorderChars}
                borderColor={theme.borderSubtle}
              >
                <text fg={theme.textMuted}>
                  {" "}
                  {authSummary(entry.request.auth)}
                </text>
              </box>
            )}
            {formatRequestHeaders(entry).map((h) => (
              <box
                key={h}
                border={[...LeftBar.border]}
                customBorderChars={LeftBar.customBorderChars}
                borderColor={theme.borderSubtle}
              >
                <text fg={theme.textMuted}> {h}</text>
              </box>
            ))}
            {entry.request.body && (
              <box
                border={[...LeftBar.border]}
                customBorderChars={LeftBar.customBorderChars}
                borderColor={theme.borderSubtle}
              >
                <text fg={theme.text}> {entry.request.body}</text>
              </box>
            )}
            {entry.envName && (
              <box
                border={[...LeftBar.border]}
                customBorderChars={LeftBar.customBorderChars}
                borderColor={theme.borderSubtle}
              >
                <text fg={theme.info}> env: {entry.envName}</text>
              </box>
            )}
          </box>
          <box
            border={["bottom"]}
            borderColor={theme.borderSubtle}
            style={{ paddingLeft: 1 }}
          >
            <text fg={theme.text}>Response</text>
          </box>
          <box style={{ flexDirection: "column", gap: 0 }}>
            {(() => {
              const r = entry.response
              if (r) {
                return (
                  <>
                    <box
                      border={[...LeftBar.border]}
                      customBorderChars={LeftBar.customBorderChars}
                      borderColor={theme.borderSubtle}
                    >
                      <text fg={theme.text}>
                        {" "}
                        {formatStatusLine(r)}
                      </text>
                    </box>
                    {formatHeaders(r).map((h) => (
                      <box
                        key={h}
                        border={[...LeftBar.border]}
                        customBorderChars={LeftBar.customBorderChars}
                        borderColor={theme.borderSubtle}
                      >
                        <text fg={theme.textMuted}> {h}</text>
                      </box>
                    ))}
                    {r.body && (
                      <box
                        border={[...LeftBar.border]}
                        customBorderChars={LeftBar.customBorderChars}
                        borderColor={theme.borderSubtle}
                      >
                        <text fg={theme.text}>
                          {" "}
                          {r.body.length > 2000
                            ? r.body.slice(0, 2000) + "..."
                            : r.body}
                        </text>
                      </box>
                    )}
                  </>
                )
              }
              if (entry.error) {
                return (
                  <box
                    border={[...LeftBar.border]}
                    customBorderChars={LeftBar.customBorderChars}
                    borderColor={theme.error}
                  >
                    <text fg={theme.error}> {entry.error.message}</text>
                  </box>
                )
              }
              return (
                <box
                  border={[...LeftBar.border]}
                  customBorderChars={LeftBar.customBorderChars}
                  borderColor={theme.borderSubtle}
                >
                  <text fg={theme.textMuted}> No response</text>
                </box>
              )
            })()}
          </box>
        </box>
      )}
    </box>
  )
}
