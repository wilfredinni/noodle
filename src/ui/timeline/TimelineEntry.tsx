import type { TimelineEntry as TimelineEntryType } from "../../schema"
import { MouseButton } from "@opentui/core"
import { useTheme } from "../theme"
import { statusColor } from "../format"
import {
  entryMethod,
  entryStatus,
  entryTiming,
  relativeTime,
  truncateUrl,
  shortMethod,
  formatRequestUrl,
} from "./formatTimeline"
import { methodColor } from "../formatRequest"

export function TimelineEntry({
  id,
  entry,
  isSelected,
  containerWidth,
  onActivate,
}: {
  id?: string
  entry: TimelineEntryType
  isSelected: boolean
  containerWidth: number
  onActivate?: () => void
}) {
  const theme = useTheme()
  const status = entryStatus(entry)
  const hasError = entry.error !== undefined

  const rowBg = isSelected ? theme.backgroundElement : undefined
  const rowFg = isSelected ? theme.text : theme.textMuted

  const method = entryMethod(entry)
  const urlStr = formatRequestUrl(entry)
  const timingStr = hasError ? "ERR" : entryTiming(entry)
  const reltimeStr = relativeTime(entry.timestamp)
  const rightStr = timingStr + " " + reltimeStr

  const ROW_PADDING = 2
  // icon (2) + method box (6) + status box (4) = 12
  const FIXED_ELEMENTS = 12 + rightStr.length
  const urlMaxLength =
    containerWidth > 0
      ? Math.max(10, containerWidth - ROW_PADDING - FIXED_ELEMENTS)
      : 999

  return (
    <box
      id={id}
      style={{
        flexDirection: "column",
        backgroundColor: rowBg,
        overflow: "hidden",
      }}
      onMouseDown={
        onActivate
          ? (event) => {
              if (event.button !== MouseButton.LEFT) return
              onActivate()
              event.stopPropagation()
            }
          : undefined
      }
    >
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
          <text fg={rowFg} style={{ marginRight: 1 }}>
            ⏎
          </text>
          <box style={{ width: 5, marginRight: 1 }}>
            <text fg={methodColor(method, theme)}>{shortMethod(method)}</text>
          </box>
          <box style={{ width: 3, marginRight: 1 }}>
            {status !== null ? (
              <text fg={statusColor(status, theme)}>
                {status === 0 ? "ERR" : status}
              </text>
            ) : (
              <text fg={theme.textMuted}>---</text>
            )}
          </box>
          <text
            fg={theme.text}
            wrapMode="none"
            style={{ flexShrink: 1, minWidth: 10 }}
          >
            {truncateUrl(urlStr, urlMaxLength)}
          </text>
        </box>
        <text
          fg={hasError ? theme.error : theme.textMuted}
          wrapMode="none"
          style={{ flexShrink: 0 }}
        >
          {rightStr}
        </text>
      </box>
    </box>
  )
}
