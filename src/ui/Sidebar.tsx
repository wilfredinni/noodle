import { TextAttributes } from "@opentui/core"
import type { Collection } from "../schema"

export function Sidebar({
  collection,
  loading,
  error,
  selectedIndex,
}: {
  collection: Collection | null
  loading: boolean
  error: Error | null
  selectedIndex: number
}) {
  return (
    <box
      style={{ border: true, width: 25, flexDirection: "column" }}
      title="Requests"
    >
      {loading ? (
        <text fg="#888">Loading…</text>
      ) : error ? (
        <text fg="#888">Error: {error.message}</text>
      ) : !collection || collection.requests.length === 0 ? (
        <text fg="#888">(empty)</text>
      ) : (
        <>
          {collection.requests.map((r, i) => (
            <text
              key={r.id}
              attributes={i === selectedIndex ? TextAttributes.INVERSE : 0}
            >
              {r.method} {r.name}
            </text>
          ))}
        </>
      )}
    </box>
  )
}
