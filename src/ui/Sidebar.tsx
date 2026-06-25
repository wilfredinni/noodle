import { ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useRef } from "react"
import type { Collection } from "../schema"
import { methodColor } from "./formatRequest"

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
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)

  useEffect(() => {
    if (selectedIndex >= 0) {
      scrollRef.current?.scrollChildIntoView(`req-${selectedIndex}`)
    }
  }, [selectedIndex])

  return (
    <box
      style={{
        border: true,
        borderColor: focused ? "#61dafb" : undefined,
        width: 25,
        flexDirection: "column",
      }}
      title={focused ? "▸ Requests" : "Requests"}
    >
      {loading ? (
        <text fg="#888">Loading…</text>
      ) : error ? (
        <text fg="#888">Error: {error.message}</text>
      ) : !collection || collection.requests.length === 0 ? (
        <text fg="#888">(empty)</text>
      ) : (
        <scrollbox ref={scrollRef} scrollY style={{ flexGrow: 1 }}>
          {collection.requests.map((r, i) => (
            <box key={r.id} id={`req-${i}`} style={{ flexDirection: "row" }}>
              <text
                fg={i === selectedIndex ? "#fff" : methodColor(r.method)}
                bg={i === selectedIndex ? "#007aff" : undefined}
              >
                {shortMethod(r.method).padEnd(7)}
              </text>
              <text
                fg={i === selectedIndex ? "#fff" : undefined}
                bg={i === selectedIndex ? "#007aff" : undefined}
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
