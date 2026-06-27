import { ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useRef } from "react"
import type { Collection } from "../schema"
import { methodColor } from "./formatRequest"
import { useTheme } from "./theme"
import { FullBorder, LeftBar } from "./borders"
import type { Keybinds } from "./keybind"

function shortMethod(m: string): string {
  return m === "DELETE" ? "DEL" : m
}

function truncName(name: string, max: number): string {
  return name.length <= max ? name : name.slice(0, max - 1) + "\u2026"
}

export function Sidebar({
  collection,
  loading,
  error,
  selectedIndex,
  focused = false,
  keybinds: _keybinds,
  dirtyRequestIds,
}: {
  collection: Collection | null
  loading: boolean
  error: Error | null
  selectedIndex: number
  focused?: boolean
  keybinds?: Keybinds
  dirtyRequestIds?: Set<string>
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
        width: 38,
        flexDirection: "column",
        flexShrink: 0,
        backgroundColor: theme.backgroundPanel,
        padding: 1,
        gap: 1,
      }}
      border={[...FullBorder.border]}
      customBorderChars={FullBorder.customBorderChars}
      borderColor={focused ? theme.primary : theme.borderSubtle}
      title="Requests"
      titleColor={focused ? theme.primary : theme.textMuted}
      titleAlignment="left"
    >
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
            const isDirty = dirtyRequestIds?.has(r.id)
            return (
              <box
                key={r.id}
                id={`req-${i}`}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  backgroundColor: isSelected
                    ? theme.backgroundElement
                    : undefined,
                }}
                border={[...LeftBar.border]}
                customBorderChars={LeftBar.customBorderChars}
                borderColor={isSelected ? theme.primary : theme.backgroundPanel}
              >
                <box style={{ flexDirection: "row" }}>
                  <text fg={methodColor(r.method, theme)}>
                    {shortMethod(r.method).padEnd(7)}
                  </text>
                  <text fg={theme.text} wrapMode="none">
                    {truncName(r.name, 20)}
                  </text>
                </box>
                {isDirty && <text fg={theme.warning}>●</text>}
              </box>
            )
          })}
        </scrollbox>
      )}
    </box>
  )
}
