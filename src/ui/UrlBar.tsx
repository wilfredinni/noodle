import { methodColor } from "./formatRequest"
import type { Method } from "../schema"

export function UrlBar({
  method,
  url,
  setUrl,
  focused = false,
}: {
  method: string
  url: string
  setUrl: (url: string) => void
  focused?: boolean
}) {
  return (
    <box
      style={{
        border: true,
        borderColor: focused ? "#61dafb" : undefined,
        flexDirection: "column",
        padding: 1,
      }}
      title={focused ? "▸ URL" : "URL"}
    >
      {!url ? (
        <text fg="#fff">(no request selected)</text>
      ) : focused ? (
        <box style={{ flexDirection: "row" }}>
          <text fg={methodColor(method as Method)}>{method}</text>
          <text> </text>
          <input
            value={url}
            onInput={setUrl}
            backgroundColor="#222"
            focusedBackgroundColor="#333"
            textColor="#fff"
            cursorColor="#0f0"
            focused
          />
        </box>
      ) : (
        <box style={{ flexDirection: "row" }}>
          <text fg={methodColor(method as Method)}>{method}</text>
          <text fg="#fff"> {url}</text>
        </box>
      )}
    </box>
  )
}
