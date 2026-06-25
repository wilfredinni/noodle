import type { Collection } from "../schema"

export function Sidebar({
  collection,
  loading,
  error,
}: {
  collection: Collection | null
  loading: boolean
  error: Error | null
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
          {collection.requests.map((r) => (
            <text key={r.id}>
              {r.method} {r.name}
            </text>
          ))}
        </>
      )}
    </box>
  )
}
