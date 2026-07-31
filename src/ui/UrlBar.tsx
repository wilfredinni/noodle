import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { MouseButton } from "@opentui/core"
import { useTheme } from "./theme"
import { FullBorder } from "./borders"
import type { Method, ParamEntry, Environment } from "../schema"
import { buildDisplayUrl } from "./urlParams"
import { VarInput } from "./VarInput"
import { Select } from "./Select"
import { METHOD_ITEMS } from "./methodItems"
import type { UrlBarSubFocus } from "./focus"
import { JumpBadge, JUMP_BADGE_TOP_LEFT } from "./JumpBadge"
import { splitUrlPathVars } from "./variable-completion/envHighlight"

export function UrlBar({
  method,
  url,
  params,
  pathParams: pathParamsProp,
  setUrl,
  setMethod = () => {},
  onDefocus,
  focused = false,
  interactive = true,
  activeEnv,
  subFocus = "select",
  jumpMode = false,
  onPaneFocus,
  onSubFocus,
}: {
  method: Method
  url: string
  params: ParamEntry[]
  pathParams?: ParamEntry[]
  setUrl: (url: string) => void
  setMethod?: (method: Method) => void
  onDefocus: (rawUrl: string) => void
  focused?: boolean
  interactive?: boolean
  activeEnv?: Environment | null
  subFocus?: UrlBarSubFocus
  jumpMode?: boolean
  onPaneFocus?: () => void
  onSubFocus?: (subFocus: UrlBarSubFocus) => void
}) {
  const theme = useTheme()
  const pathParams = pathParamsProp ?? []
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

  const displayUrl = buildDisplayUrl(url, params)

  const handleInput = useCallback(
    (val: string) => {
      setInputValue(val)
      inputValueRef.current = val
      setUrl(val)
    },
    [setUrl],
  )

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
      onMouseDown={
        onPaneFocus
          ? (event) => {
              if (event.button === MouseButton.LEFT) onPaneFocus()
            }
          : undefined
      }
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
            {jumpMode && <JumpBadge letter="m" style={JUMP_BADGE_TOP_LEFT} />}
            <Select
              items={METHOD_ITEMS}
              value={method}
              onChange={(value) => setMethod(value as Method)}
              focused={focused && interactive && subFocus === "select"}
              visualFocused={focused && subFocus === "select"}
              badge
              maxDropdownHeight={10}
              onOpenChange={setMethodSelectOpen}
              interactive={interactive}
            />
          </box>
          <box
            onMouseDown={(event) => {
              if (event.button !== MouseButton.LEFT) return
              onSubFocus?.("text")
              event.stopPropagation()
            }}
            style={{ flexGrow: 1, flexShrink: 1, position: "relative" }}
          >
            {jumpMode && <JumpBadge letter="u" style={JUMP_BADGE_TOP_LEFT} />}
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
                pathParams={pathParams}
              />
            ) : (
              <UrlBarText
                text={` ${displayUrl}`}
                env={activeEnv ?? null}
                pathParams={pathParams}
              />
            )}
          </box>
        </box>
      )}
    </box>
  )
}

function UrlBarText({
  text,
  env,
  pathParams,
}: {
  text: string
  env: Environment | null
  pathParams: ParamEntry[]
}) {
  const theme = useTheme()
  const segments = useMemo(
    () => splitUrlPathVars(text, env, pathParams),
    [text, env, pathParams],
  )

  return (
    <box
      style={{
        flexDirection: "row",
        gap: 0,
        flexShrink: 1,
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      {segments.map((seg, i) => {
        let color = theme.text
        if (seg.isVar) {
          color = seg.exists ? theme.primary : theme.error
        } else if (seg.isPath) {
          color = seg.exists ? theme.primary : theme.error
        }
        return (
          <text key={i} fg={color} wrapMode="none" style={{ flexShrink: 0 }}>
            {seg.text}
          </text>
        )
      })}
    </box>
  )
}
