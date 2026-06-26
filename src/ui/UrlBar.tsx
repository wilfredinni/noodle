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
        flexShrink: 0,
        padding: 1,
        gap: 1,
        backgroundColor: theme.backgroundPanel,
      }}
      border={[...FullBorder.border]}
      customBorderChars={FullBorder.customBorderChars}
      borderColor={focused ? theme.primary : theme.borderSubtle}
      title="URL"
      titleColor={focused ? theme.primary : theme.textMuted}
      titleAlignment="left"
    >
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
