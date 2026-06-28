import type { TimelineEntry as TimelineEntryType } from "../../schema"
import { useTheme } from "../theme"
import { LeftBar } from "../borders"
import { formatHeaders, formatBody, statusColor, formatStatusLine } from "../format"
import { Badge } from "../Badge"
import {
  entryMethod,
  entryStatus,
  entryTiming,
  entryStatusFg,
  relativeTime,
  truncateUrl,
} from "./formatTimeline"

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
  entry,
  isSelected,
  isExpanded,
  activeSubTab,
}: {
  entry: TimelineEntryType
  isSelected: boolean
  isExpanded: boolean
  activeSubTab: "request" | "response"
}) {
  const theme = useTheme()
  const status = entryStatus(entry)
  const hasResponse = entry.response !== undefined
  const hasError = entry.error !== undefined

  const prefix = isExpanded ? "▾" : "▸"
  const rowBg = isSelected ? theme.backgroundSelected : "default"
  const rowFg = isSelected ? theme.text : theme.textMuted

  return (
    <box style={{ flexDirection: "column", backgroundColor: rowBg }}>
      <box
        style={{
          flexDirection: "row",
          gap: 1,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <text fg={rowFg}>{prefix} </text>
        <Badge
          bg={statusColor(
            entryMethod(entry) === "GET"
              ? 200
              : entryMethod(entry) === "POST"
                ? 201
                : entryMethod(entry) === "DELETE"
                  ? 204
                  : 200,
            theme,
          )}
          fg={theme.background}
        >
          {entryMethod(entry)}
        </Badge>
        {status !== null ? (
          <Badge
            bg={entryStatusFg(status, theme)}
            fg={status === 0 ? theme.background : theme.background}
          >
            {status === 0 ? "ERR" : `${status}`}
          </Badge>
        ) : (
          <text fg={theme.textMuted}> --- </text>
        )}
        <text fg={theme.text} style={{ flexGrow: 1 }}>
          {truncateUrl(formatRequestUrl(entry), 50)}
        </text>
        <text fg={hasError ? theme.error : theme.textMuted}>
          {entryTiming(entry)}
        </text>
        <text fg={theme.textMuted}>{relativeTime(entry.timestamp)}</text>
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
          <box style={{ flexDirection: "row", gap: 1, paddingLeft: 1 }}>
            <text
              fg={
                activeSubTab === "request" ? theme.primary : theme.textMuted
              }
            >
              Request
            </text>
            <text fg={theme.textMuted}>|</text>
            <text
              fg={
                activeSubTab === "response" ? theme.primary : theme.textMuted
              }
            >
              Response
            </text>
          </box>

          {activeSubTab === "request" ? (
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
          ) : (
            <box style={{ flexDirection: "column", gap: 0 }}>
              {hasResponse ? (
                <>
                  <box
                    border={[...LeftBar.border]}
                    customBorderChars={LeftBar.customBorderChars}
                    borderColor={theme.borderSubtle}
                  >
                    <text fg={theme.text}>
                      {" "}
                      {formatStatusLine(entry.response)}
                    </text>
                  </box>
                  {formatHeaders(entry.response).map((h) => (
                    <box
                      key={h}
                      border={[...LeftBar.border]}
                      customBorderChars={LeftBar.customBorderChars}
                      borderColor={theme.borderSubtle}
                    >
                      <text fg={theme.textMuted}> {h}</text>
                    </box>
                  ))}
                  {entry.response.body && (
                    <box
                      border={[...LeftBar.border]}
                      customBorderChars={LeftBar.customBorderChars}
                      borderColor={theme.borderSubtle}
                    >
                      <text fg={theme.text}>
                        {" "}
                        {entry.response.body.length > 2000
                          ? entry.response.body.slice(0, 2000) + "..."
                          : entry.response.body}
                      </text>
                    </box>
                  )}
                </>
              ) : hasError ? (
                <box
                  border={[...LeftBar.border]}
                  customBorderChars={LeftBar.customBorderChars}
                  borderColor={theme.error}
                >
                  <text fg={theme.error}> {entry.error!.message}</text>
                </box>
              ) : (
                <box
                  border={[...LeftBar.border]}
                  customBorderChars={LeftBar.customBorderChars}
                  borderColor={theme.borderSubtle}
                >
                  <text fg={theme.textMuted}> No response</text>
                </box>
              )}
            </box>
          )}
        </box>
      )}
    </box>
  )
}
