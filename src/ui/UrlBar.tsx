import { useCallback, useEffect, useRef, useState } from "react"
import { useTheme } from "./theme"
import { FullBorder } from "./borders"
import type { Method, ParamEntry, Environment } from "../schema"
import { buildDisplayUrl } from "./urlParams"
import { VarInput } from "./VarInput"
import { VarText } from "./VarText"
import { Select } from "./Select"
import { METHOD_ITEMS } from "./methodItems"
import type { UrlBarSubFocus } from "./focus"

export function UrlBar({
  method,
  url,
  params,
  setUrl,
  setMethod = () => {},
  onDefocus,
  focused = false,
  activeEnv,
  subFocus = "select",
}: {
  method: Method
  url: string
  params: ParamEntry[]
  setUrl: (url: string) => void
  setMethod?: (method: Method) => void
  onDefocus: (rawUrl: string) => void
  focused?: boolean
  activeEnv?: Environment | null
  subFocus?: UrlBarSubFocus
}) {
  const theme = useTheme()
  const [inputValue, setInputValue] = useState(url)
  const [methodSelectOpen, setMethodSelectOpen] = useState(false)
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
        zIndex: methodSelectOpen ? 1 : undefined,
      }}
      border={[...FullBorder.border]}
      customBorderChars={FullBorder.customBorderChars}
      borderColor={focused ? theme.primary : theme.borderSubtle}
    >
      {!displayUrl ? (
        <box
          style={{
            flexGrow: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <text fg={theme.textMuted}>no request selected</text>
        </box>
      ) : (
        <box style={{ flexDirection: "row", gap: 1, paddingX: 1 }}>
          <Select
            items={METHOD_ITEMS}
            value={method}
            onChange={(value) => setMethod(value as Method)}
            focused={focused && subFocus === "select"}
            badge
            width={8}
            maxDropdownHeight={10}
            onOpenChange={setMethodSelectOpen}
          />
          {focused && subFocus === "text" ? (
            <box style={{ flexGrow: 1 }}>
              <VarInput
                value={inputValue}
                env={activeEnv ?? null}
                isEditing
                onChange={handleInput}
                isFocused
                backgroundColor={theme.backgroundElement}
                focusedBackgroundColor={theme.borderSubtle}
                paddingX={1}
                style={{ flexGrow: 1 }}
              />
            </box>
          ) : (
            <box
              style={{
                backgroundColor: theme.backgroundElement,
                flexGrow: 1,
                overflow: "hidden",
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
