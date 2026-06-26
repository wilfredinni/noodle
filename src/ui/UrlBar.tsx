import { methodColor } from "./formatRequest"
import { useTheme } from "./theme"
import { FullBorder } from "./borders"
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
  const theme = useTheme()

  return (
    <box
      style={{
        flexDirection: "column",
        padding: 1,
        gap: 1,
        backgroundColor: theme.backgroundPanel,
        flexShrink: 0,
      }}
      border={[...FullBorder.border]}
      customBorderChars={FullBorder.customBorderChars}
      borderColor={focused ? theme.accent : theme.borderSubtle}
    >
      <text fg={focused ? theme.accent : theme.textMuted}>
        {focused ? "URL [e] edit  [Tab] next" : "URL"}
      </text>
      {!url ? (
        <text fg={theme.text}>(no request selected)</text>
      ) : focused ? (
        <box style={{ flexDirection: "row" }}>
          <text fg={methodColor(method as Method, theme)}>{method}</text>
          <text> </text>
          <input
            value={url}
            onInput={setUrl}
            backgroundColor={theme.backgroundElement}
            focusedBackgroundColor={theme.borderSubtle}
            textColor={theme.text}
            cursorColor={theme.primary}
            focused
          />
        </box>
      ) : (
        <box style={{ flexDirection: "row" }}>
          <text fg={methodColor(method as Method, theme)}>{method}</text>
          <text fg={theme.text}> {url}</text>
        </box>
      )}
    </box>
  )
}
