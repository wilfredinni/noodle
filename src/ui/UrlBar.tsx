import { useCallback, useEffect, useRef, useState } from "react"
import { Badge } from "./Badge"
import { methodColor } from "./formatRequest"
import { useTheme } from "./theme"
import { FullBorder } from "./borders"
import type { Method, KvEntry, Environment } from "../schema"
import { buildDisplayUrl } from "./urlParams"
import { VarText } from "./VarText"

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

export function UrlBar({
  method,
  url,
  params,
  setUrl,
  onDefocus,
  focused = false,
  sending = false,
  activeEnv,
}: {
  method: string
  url: string
  params: Record<string, KvEntry>
  setUrl: (url: string) => void
  onDefocus: (rawUrl: string) => void
  focused?: boolean
  sending?: boolean
  activeEnv?: Environment | null
}) {
  const theme = useTheme()
  const [spinnerIdx, setSpinnerIdx] = useState(0)
  const [inputValue, setInputValue] = useState(url)
  const prevFocused = useRef(focused)

  useEffect(() => {
    if (!sending) return
    const id = setInterval(() => {
      setSpinnerIdx((i) => (i + 1) % SPINNER_FRAMES.length)
    }, 80)
    return () => clearInterval(id)
  }, [sending])

  useEffect(() => {
    if (focused && !prevFocused.current) {
      setInputValue(buildDisplayUrl(url, params))
    }
    if (!focused && prevFocused.current) {
      onDefocus(inputValue)
    }
    prevFocused.current = focused
  }, [focused])

  useEffect(() => {
    if (!focused) {
      setInputValue(url)
    }
  }, [url, focused])

  const handleInput = useCallback(
    (val: string) => {
      setInputValue(val)
      setUrl(val)
    },
    [setUrl],
  )

  const displayUrl = buildDisplayUrl(url, params)

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
      {!displayUrl ? (
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
                value={inputValue}
                onInput={handleInput}
                backgroundColor={theme.backgroundElement}
                focusedBackgroundColor={theme.borderSubtle}
                textColor={theme.text}
                cursorColor={theme.primary}
                paddingX={1}
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
              <VarText text={` ${displayUrl}`} env={activeEnv ?? null} />
            </box>
          )}
          <box
            style={{
              flexShrink: 0,
              backgroundColor: sending
                ? theme.backgroundElement
                : theme.primary,
              paddingX: 2,
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
