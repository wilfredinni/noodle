import { useEffect, useState } from "react"
import { Badge } from "./Badge"
import { methodColor } from "./formatRequest"
import { useTheme } from "./theme"
import { FullBorder } from "./borders"
import type { Method } from "../schema"

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

export function UrlBar({
  method,
  url,
  setUrl,
  focused = false,
  sending = false,
}: {
  method: string
  url: string
  setUrl: (url: string) => void
  focused?: boolean
  sending?: boolean
}) {
  const theme = useTheme()
  const [spinnerIdx, setSpinnerIdx] = useState(0)

  useEffect(() => {
    if (!sending) return
    const id = setInterval(() => {
      setSpinnerIdx((i) => (i + 1) % SPINNER_FRAMES.length)
    }, 80)
    return () => clearInterval(id)
  }, [sending])

  return (
    <box
      style={{
        flexDirection: "column",
        flexShrink: 0,
        backgroundColor: theme.backgroundPanel,
      }}
      border={[...FullBorder.border]}
      customBorderChars={FullBorder.customBorderChars}
      borderColor={focused ? theme.primary : theme.borderSubtle}
    >
      {!url ? (
        <text fg={theme.text}>(no request selected)</text>
      ) : (
        <box style={{ flexDirection: "row", gap: 1, paddingX: 1 }}>
          <Badge
            bg={methodColor(method as Method, theme)}
            fg={theme.background}
          >
            {method === "DELETE" ? "DEL" : method}
          </Badge>
          {focused ? (
            <box style={{ flexGrow: 1 }}>
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
            <box
              style={{
                backgroundColor: theme.backgroundElement,
                flexGrow: 1,
              }}
            >
              <text fg={theme.text}> {url}</text>
            </box>
          )}
          <box
            style={{
              flexShrink: 0,
              backgroundColor: sending
                ? theme.backgroundElement
                : theme.primary,
              paddingLeft: 1,
              paddingRight: 1,
            }}
          >
            <text fg={sending ? theme.textMuted : theme.background}>
              {sending ? `${SPINNER_FRAMES[spinnerIdx]} sending` : "Send"}
            </text>
          </box>
        </box>
      )}
    </box>
  )
}
