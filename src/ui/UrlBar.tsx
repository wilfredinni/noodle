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
import { JumpBadge } from "./JumpBadge"

export function UrlBar({
  method,
  url,
  params,
  setUrl,
  setMethod = () => {},
  onDefocus,
  focused = false,
  interactive = true,
  activeEnv,
  subFocus = "select",
  jumpMode = false,
}: {
  method: Method
  url: string
  params: ParamEntry[]
  setUrl: (url: string) => void
  setMethod?: (method: Method) => void
  onDefocus: (rawUrl: string) => void
  focused?: boolean
  interactive?: boolean
  activeEnv?: Environment | null
  subFocus?: UrlBarSubFocus
  jumpMode?: boolean
}) {
  const theme = useTheme()
  const [inputValue, setInputValue] = useState(url)
  const [methodSelectOpen, setMethodSelectOpen] = useState(false)
  const prevFocused = useRef(focused)
  const initDisplayRef = useRef("")
  const inputValueRef = useRef(inputValue)
  inputValueRef.current = inputValue

  useEffect(() => {
    if (focused && !prevFocused.current) {
      const displayUrl = buildDisplayUrl(url, params)
      setInputValue(displayUrl)
      inputValueRef.current = displayUrl
      initDisplayRef.current = displayUrl
    }
    if (!focused && prevFocused.current) {
      if (inputValueRef.current !== initDisplayRef.current) {
        onDefocus(inputValueRef.current)
      }
    }
    prevFocused.current = focused
  }, [focused, onDefocus, params, url])

  useEffect(() => {
    const displayUrl = buildDisplayUrl(url, params)
    if (!focused) {
      setInputValue(displayUrl)
      inputValueRef.current = displayUrl
    } else if (inputValueRef.current === initDisplayRef.current) {
      setInputValue(displayUrl)
      inputValueRef.current = displayUrl
      initDisplayRef.current = displayUrl
    }
  }, [url, params, focused])

  const handleInput = useCallback(
    (val: string) => {
      setInputValue(val)
      inputValueRef.current = val
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
          <box style={{ flexShrink: 0, position: "relative" }}>
            {jumpMode && <JumpBadge letter="m" style={{ top: -1, left: 0 }} />}
            <Select
              items={METHOD_ITEMS}
              value={method}
              onChange={(value) => setMethod(value as Method)}
              focused={focused && interactive && subFocus === "select"}
              visualFocused={focused && subFocus === "select"}
              badge
              maxDropdownHeight={10}
              onOpenChange={setMethodSelectOpen}
            />
          </box>
          <box style={{ flexGrow: 1, flexShrink: 1, position: "relative" }}>
            {jumpMode && <JumpBadge letter="u" style={{ top: -1, left: 0 }} />}
            {focused && subFocus === "text" && interactive ? (
              <VarInput
                value={inputValue}
                env={activeEnv ?? null}
                isEditing
                onChange={handleInput}
                isFocused
                backgroundColor={theme.backgroundElement}
                focusedBackgroundColor={theme.borderSubtle}
                paddingX={1}
                style={{ flexGrow: 1, flexShrink: 1 }}
              />
            ) : (
              <box
                style={{
                  backgroundColor:
                    focused && subFocus === "text"
                      ? theme.borderSubtle
                      : theme.backgroundElement,
                  flexGrow: 1,
                  overflow: "hidden",
                }}
              >
                <VarText text={` ${displayUrl}`} env={activeEnv ?? null} />
              </box>
            )}
          </box>
        </box>
      )}
    </box>
  )
}
