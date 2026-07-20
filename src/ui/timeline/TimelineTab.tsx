import { useEffect, useRef, useState } from "react"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { useKeymap } from "@opentui/keymap/react"
import type { TimelineEntry as TimelineEntryType } from "../../schema"
import { useTheme } from "../theme"
import { TimelineEntry } from "./TimelineEntry"

export function TimelineTab({
  entries,
  focused,
  onOpenEntry,
  layout,
  expanded,
}: {
  entries: TimelineEntryType[]
  focused: boolean
  onOpenEntry?: (entry: TimelineEntryType) => void
  layout?: "stacked" | "side-by-side"
  expanded?: "request" | "response" | null
}) {
  const theme = useTheme()
  const keymap = useKeymap()
  const { width: termWidth } = useTerminalDimensions()
  const focusedRef = useRef(focused)
  focusedRef.current = focused
  const scrollRef = useRef<import("@opentui/core").ScrollBoxRenderable | null>(
    null,
  )

  const [selectedIdx, setSelectedIdx] = useState(0)
  const [containerWidth, setContainerWidth] = useState(0)
  const containerWidthRef = useRef(0)

  useEffect(() => {
    let active = true
    const measure = () => {
      if (!active) return
      const box = scrollRef.current
      if (!box || !box.width || box.width <= 0) {
        setTimeout(measure, 10)
        return
      }
      const w = box.width
      if (w !== containerWidthRef.current) {
        containerWidthRef.current = w
        setContainerWidth(w)
      }
    }
    setTimeout(measure, 0)
    return () => {
      active = false
    }
  }, [termWidth, layout, expanded])

  useEffect(() => {
    setSelectedIdx(0)
  }, [entries.length])

  useKeyboard((key) => {
    if (!focusedRef.current) return
    if (entries.length === 0) return
    if (keymap.getData("app.overlay") !== "none") return

    if (key.name === "up") {
      setSelectedIdx((prev) => {
        const next = prev <= 0 ? entries.length - 1 : prev - 1
        scrollRef.current?.scrollChildIntoView(`tl-${next}`)
        return next
      })
    } else if (key.name === "down") {
      setSelectedIdx((prev) => {
        const next = prev >= entries.length - 1 ? 0 : prev + 1
        scrollRef.current?.scrollChildIntoView(`tl-${next}`)
        return next
      })
    } else if (key.name === "return") {
      setSelectedIdx((prev) => {
        onOpenEntry?.(entries[prev])
        return prev
      })
    }
  })

  if (entries.length === 0) {
    return (
      <box style={{ flexGrow: 1, flexBasis: 0, minHeight: 0 }}>
        <text fg={theme.textMuted}>
          {" "}
          No timeline entries yet. Send a request to record history.
        </text>
      </box>
    )
  }

  return (
    <scrollbox
      ref={scrollRef}
      scrollY
      scrollbarOptions={{ visible: false }}
      style={{ flexGrow: 1, minHeight: 0, flexBasis: 0 }}
    >
      {entries.map((entry, idx) => (
        <TimelineEntry
          key={`${entry.timestamp}-${idx}`}
          id={`tl-${idx}`}
          entry={entry}
          isSelected={idx === selectedIdx}
          containerWidth={containerWidth}
        />
      ))}
    </scrollbox>
  )
}
