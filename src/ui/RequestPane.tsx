import type { Request } from "../schema"

export function RequestPane({ request }: { request: Request | null }) {
  return (
    <box
      style={{
        border: true,
        flexGrow: 1,
        flexDirection: "column",
        padding: 1,
        gap: 1,
      }}
      title="Request"
    >
      {request ? (
        <>
          <text>
            {request.method} {request.url}
          </text>
          <text fg="#888">[Send]</text>
        </>
      ) : (
        <text fg="#888">(no request selected)</text>
      )}
    </box>
  )
}
