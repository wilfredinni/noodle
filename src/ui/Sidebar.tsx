import { ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useRef } from "react"
import type { Collection } from "../schema"
import { methodColor } from "./formatRequest"
import { useTheme } from "./theme"
import { FullBorder, LeftBar } from "./borders"

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
        flexShrink: 0,
        backgroundColor: theme.backgroundPanel,
        padding: 1,
        gap: 1,
      }}
      border={[...FullBorder.border]}
      customBorderChars={FullBorder.customBorderChars}
      borderColor={focused ? theme.primary : theme.borderSubtle}
    >
      <text fg={focused ? theme.primary : theme.textMuted}>
        {focused ? "Requests [↑↓]  [e] edit" : "Requests"}
      </text>
      {loading ? (
        <text fg={theme.textMuted}>Loading...</text>
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
          {collection.requests.map((r, i) => {
            const isSelected = i === selectedIndex
            return (
              <box
                key={r.id}
                id={`req-${i}`}
                style={{
                  flexDirection: "row",
                  backgroundColor: isSelected ? theme.backgroundElement : undefined,
                }}
                border={isSelected ? [...LeftBar.border] : undefined}
                customBorderChars={isSelected ? LeftBar.customBorderChars : undefined}
                borderColor={isSelected ? theme.primary : undefined}
              >
                <text fg={methodColor(r.method, theme)}>
                  {shortMethod(r.method).padEnd(7)}
                </text>
                <text fg={theme.text}>
                  {r.name}
                </text>
              </box>
            )
          })}
        </scrollbox>
      )}
    </box>
  )
}
