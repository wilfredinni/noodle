import { ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useRef } from "react"
import type { Collection } from "../schema"
import { methodColor } from "./formatRequest"
import { useTheme } from "./theme"
import { contrastOnPrimary } from "./theme"

function shortMethod(m: string): string {
  return m === "DELETE" ? "DEL" : m
}

export function Sidebar({
  collection,
  loading,
  error,
  selectedIndex,
  focused = false,
}: {
  collection: Collection | null
  loading: boolean
  error: Error | null
  selectedIndex: number
  focused?: boolean
}) {
  const theme = useTheme()
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)

  useEffect(() => {
    if (selectedIndex >= 0) {
      scrollRef.current?.scrollChildIntoView(`req-${selectedIndex}`)
    }
  }, [selectedIndex])

  return (
    <box
      style={{
        width: 25,
        flexDirection: "column",
        backgroundColor: theme.backgroundPanel,
      }}
    >
      <text fg={focused ? theme.primary : theme.textMuted}>
        {focused ? "▸ Requests" : "Requests"}
      </text>
      {loading ? (
        <text fg={theme.textMuted}>Loading…</text>
      ) : error ? (
        <text fg={theme.textMuted}>Error: {error.message}</text>
      ) : !collection || collection.requests.length === 0 ? (
        <text fg={theme.textMuted}>(empty)</text>
      ) : (
        <scrollbox
          ref={scrollRef}
          scrollY
          style={{ flexGrow: 1 }}
          verticalScrollbarOptions={{
            trackOptions: {
              backgroundColor: theme.background,
              foregroundColor: theme.borderActive,
            },
          }}
        >
          {collection.requests.map((r, i) => (
            <box key={r.id} id={`req-${i}`} style={{ flexDirection: "row" }}>
              <text
                fg={
                  i === selectedIndex
                    ? contrastOnPrimary(theme)
                    : methodColor(r.method, theme)
                }
                bg={i === selectedIndex ? theme.primary : undefined}
              >
                {shortMethod(r.method).padEnd(7)}
              </text>
              <text
                fg={i === selectedIndex ? contrastOnPrimary(theme) : theme.text}
                bg={i === selectedIndex ? theme.primary : undefined}
              >
                {r.name}
              </text>
            </box>
          ))}
        </scrollbox>
      )}
    </box>
  )
}
