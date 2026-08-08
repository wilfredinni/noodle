import type { NetworkEvent } from "../schema"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { RefObject } from "react"
import { useTheme } from "./theme"

function eventColor(event: NetworkEvent, theme: ReturnType<typeof useTheme>) {
  if (event.type === "error") return theme.error
  if (event.type === "redirect") return theme.warning
  if (event.type === "response" || event.type === "complete")
    return theme.success
  if (event.type === "request") return theme.primary
  if (event.type === "proxy") return theme.info
  return theme.textMuted
}

export function NetworkTab({
  events,
  emptyMessage = "Send a request to see network activity.",
  height,
  scrollRef,
}: {
  events?: NetworkEvent[]
  emptyMessage?: string
  height?: number
  scrollRef?: RefObject<ScrollBoxRenderable | null>
}) {
  const theme = useTheme()
  const rows = events?.map((event, index) => (
    <box key={index} style={{ flexDirection: "row", gap: 1 }}>
      <text fg={theme.textMuted} style={{ width: 7 }}>
        {`${Math.round(event.timeMs)}ms`}
      </text>
      <text fg={eventColor(event, theme)}>{event.message}</text>
    </box>
  ))

  return (
    <box
      style={{
        flexDirection: "column",
        flexGrow: height === undefined ? 1 : 0,
        minHeight: 0,
        ...(height !== undefined && { height }),
      }}
    >
      {!events?.length ? (
        <text fg={theme.textMuted}>{emptyMessage}</text>
      ) : (
        <scrollbox
          id="network-tab-scrollbox"
          ref={scrollRef}
          scrollY
          contentOptions={{ flexDirection: "column" }}
          verticalScrollbarOptions={{
            trackOptions: {
              backgroundColor: theme.background,
              foregroundColor: theme.borderActive,
            },
          }}
          style={{
            flexGrow: 1,
            minHeight: 0,
            flexBasis: 0,
          }}
        >
          {rows}
        </scrollbox>
      )}
    </box>
  )
}
