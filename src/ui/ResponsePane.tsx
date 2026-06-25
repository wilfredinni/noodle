import type { SendState } from "./sendState"
import {
  statusColor,
  formatStatusLine,
  formatHeaders,
  formatBody,
} from "./format"

export function ResponsePane({ state }: { state: SendState }) {
  return (
    <box
      style={{
        border: true,
        flexGrow: 1,
        flexDirection: "column",
        padding: 1,
        gap: 1,
      }}
      title="Response"
    >
      {state.status === "idle" ? (
        <text fg="#888">(no response yet)</text>
      ) : state.status === "sending" ? (
        <text fg="#888">
          Sending {state.request.method} {state.request.url}…
        </text>
      ) : state.status === "error" ? (
        <text fg="#c00">{state.error.message}</text>
      ) : (
        <>
          <text fg={statusColor(state.response.status)}>
            {formatStatusLine(state.response)}
          </text>
          {formatHeaders(state.response).map((line) => (
            <text key={line} fg="#888">
              {line}
            </text>
          ))}
          {(() => {
            const body = formatBody(state.response)
            return body !== "" ? <text>{body}</text> : null
          })()}
        </>
      )}
    </box>
  )
}
