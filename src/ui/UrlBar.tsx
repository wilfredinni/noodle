import { useCallback, useEffect, useRef, useState } from "react"
import { Badge } from "./Badge"
import { methodColor } from "./formatRequest"
import { useTheme } from "./theme"
import { FullBorder } from "./borders"
import type { Method, KvEntry, Environment } from "../schema"
import { buildDisplayUrl } from "./urlParams"
import { VarText } from "./VarText"

export function UrlBar({
  method,
  url,
  params,
  setUrl,
  onDefocus,
  focused = false,
  activeEnv,
}: {
  method: string
  url: string
  params: Record<string, KvEntry>
  setUrl: (url: string) => void
  onDefocus: (rawUrl: string) => void
  focused?: boolean
  activeEnv?: Environment | null
}) {
  const theme = useTheme()
  const [inputValue, setInputValue] = useState(url)
  const prevFocused = useRef(focused)
  const initDisplayRef = useRef("")

  useEffect(() => {
    if (focused && !prevFocused.current) {
      const displayUrl = buildDisplayUrl(url, params)
      setInputValue(displayUrl)
      initDisplayRef.current = displayUrl
    }
    if (!focused && prevFocused.current) {
      const displayUrl = buildDisplayUrl(url, params)
      if (inputValue !== displayUrl) {
        onDefocus(inputValue)
      }
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
      if (val === initDisplayRef.current) return
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
        </box>
      )}
    </box>
  )
}
