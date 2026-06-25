import { TextAttributes, ScrollBoxRenderable } from "@opentui/core"
import { useRef } from "react"
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
                fg={methodColor(r.method)}
                attributes={i === selectedIndex ? TextAttributes.INVERSE : 0}
              >
                {shortMethod(r.method).padEnd(7)}
              </text>
              <text
                attributes={i === selectedIndex ? TextAttributes.INVERSE : 0}
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
