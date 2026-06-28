import { useEffect, useRef, useState } from "react"
import { useKeyboard } from "@opentui/react"
import type { TimelineEntry as TimelineEntryType } from "../../schema"
import { useTheme } from "../theme"
import { TimelineEntry } from "./TimelineEntry"

export function TimelineTab({
  entries,
  focused,
}: {
  entries: TimelineEntryType[]
  focused: boolean
}) {
  const theme = useTheme()
  const focusedRef = useRef(focused)
  focusedRef.current = focused
  const scrollRef = useRef<import("@opentui/core").ScrollBoxRenderable | null>(
    null,
  )

  const [selectedIdx, setSelectedIdx] = useState(0)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [activeSubTab, setActiveSubTab] = useState<"request" | "response">(
    "request",
  )

  useEffect(() => {
    setSelectedIdx(0)
    setExpandedIdx(null)
    setActiveSubTab("request")
  }, [entries.length])

  useKeyboard((key) => {
    if (!focusedRef.current) return
    if (entries.length === 0) return

    if (key.name === "up") {
      setSelectedIdx((prev) => (prev <= 0 ? entries.length - 1 : prev - 1))
      scrollRef.current?.scrollBy(-1)
    } else if (key.name === "down") {
      setSelectedIdx((prev) => (prev >= entries.length - 1 ? 0 : prev + 1))
      scrollRef.current?.scrollBy(1)
    } else if (key.name === "return") {
      setExpandedIdx((prev) => (prev === selectedIdx ? null : selectedIdx))
    } else if (key.name === "left") {
      if (expandedIdx === selectedIdx && activeSubTab === "response") {
        setActiveSubTab("request")
      }
    } else if (key.name === "right") {
      if (expandedIdx === selectedIdx && activeSubTab === "request") {
        setActiveSubTab("response")
      }
    }
  })

  if (entries.length === 0) {
    return (
      <box style={{ flexGrow: 1, flexBasis: 0, minHeight: 0 }}>
        <text fg={theme.textMuted}> No timeline entries yet. Send a request to record history.</text>
      </box>
    )
  }

  return (
    <scrollbox
      ref={scrollRef}
      scrollY
      style={{ flexGrow: 1, minHeight: 0, flexBasis: 0 }}
    >
      {entries.map((entry, idx) => (
        <TimelineEntry
          key={`${entry.timestamp}-${idx}`}
          entry={entry}
          isSelected={idx === selectedIdx}
          isExpanded={idx === expandedIdx}
          activeSubTab={activeSubTab}
        />
      ))}
    </scrollbox>
  )
}
