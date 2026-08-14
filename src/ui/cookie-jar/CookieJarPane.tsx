import { useTheme } from "../theme"
import { FullBorder } from "../borders"
import { useEffect, useRef, useState } from "react"
import {
  MouseButton,
  type InputRenderable,
  type ScrollBoxRenderable,
} from "@opentui/core"
import { Frame } from "../Frame"
import { JumpBadge, JUMP_BADGE_TOP_INDENT } from "../JumpBadge"
import type { CookieJarStatus } from "../../cookies"
import type { UseCookieJarViewResult } from "../../hooks/useCookieJarView"
import { CookieRow, cookieDetails, cookieNameWidth } from "../CookieRow"

export function CookieJarPane({
  view,
  status,
  domain,
  focused,
  jumpMode = false,
  onPaneFocus,
  onRetry,
  onReset,
  resetKey = "^alt+w",
}: {
  view: UseCookieJarViewResult
  status: CookieJarStatus
  domain: string | null
  focused: boolean
  jumpMode?: boolean
  onPaneFocus?: () => void
  onRetry?: () => void
  onReset?: () => void
  resetKey?: string
}) {
  const theme = useTheme()
  const cookies = view.cookies
  const cookieIndex = view.cookieIndex
  const expandedCookieIndex = view.expandedCookieIndex
  const cookieNameColumnWidth = cookieNameWidth(cookies)
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const filterRef = useRef<InputRenderable | null>(null)

  useEffect(() => {
    if (cookieIndex >= 0) {
      scrollRef.current?.scrollChildIntoView(`cookie-row-${cookieIndex}`)
    }
  }, [cookieIndex, expandedCookieIndex])

  useEffect(() => {
    if (view.filtering) filterRef.current?.focus()
  }, [view.filtering])

  return (
    <Frame
      style={{
        flexDirection: "column",
        flexGrow: 1,
        minHeight: 0,
        padding: 0,
        gap: 1,
        backgroundColor: theme.backgroundPanel,
      }}
      border={[...FullBorder.border]}
      customBorderChars={FullBorder.customBorderChars}
      borderColor={focused ? theme.primary : theme.borderSubtle}
      onPaneFocus={onPaneFocus}
    >
      {jumpMode && <JumpBadge letter="c" style={JUMP_BADGE_TOP_INDENT} />}
      {status.state === "plaintext-warning" && (
        <box
          style={{
            flexDirection: "column",
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor: theme.backgroundElement,
          }}
        >
          <text fg={theme.warning}>cookies plaintext</text>
          <text fg={theme.textMuted}>{status.warning}</text>
        </box>
      )}
      {status.state === "unavailable" && (
        <box
          style={{
            flexDirection: "column",
            gap: 1,
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor: theme.backgroundElement,
          }}
        >
          <text fg={theme.error}>cookies unavailable</text>
          <text fg={theme.text}>{status.error.message}</text>
          <text fg={theme.textMuted}>
            {`${status.error.code} · ${status.error.file}`}
          </text>
          <box style={{ flexDirection: "row", gap: 2 }}>
            <box
              onMouseDown={(event) => {
                if (event.button !== MouseButton.LEFT) return
                onRetry?.()
                event.preventDefault()
                event.stopPropagation()
              }}
            >
              <text fg={theme.primary}>Retry (r)</text>
            </box>
            <box
              onMouseDown={(event) => {
                if (event.button !== MouseButton.LEFT) return
                onReset?.()
                event.preventDefault()
                event.stopPropagation()
              }}
            >
              <text fg={theme.error}>Reset with backup ({resetKey})</text>
            </box>
          </box>
        </box>
      )}
      {domain === null ? (
        <text fg={theme.textMuted}>
          Select a domain to inspect its cookies.
        </text>
      ) : (
        <>
          {view.filtering && (
            <input
              ref={filterRef}
              value={view.filter}
              placeholder="Filter cookies…"
              onInput={view.setFilter}
              focused
              backgroundColor={theme.backgroundElement}
              focusedBackgroundColor={theme.borderSubtle}
              textColor={theme.text}
              cursorColor={theme.primary}
              placeholderColor={theme.textMuted}
              paddingX={1}
              style={{ flexShrink: 0 }}
            />
          )}
          {cookies.length === 0 ? (
            <text fg={theme.textMuted}>
              {view.filter.trim()
                ? "No cookies match the filter."
                : "(no cookies for this domain)"}
            </text>
          ) : (
            <scrollbox
              ref={scrollRef}
              scrollY
              key={cookies.length}
              style={{ flexGrow: 1, minHeight: 0 }}
              verticalScrollbarOptions={{
                trackOptions: {
                  backgroundColor: theme.background,
                  foregroundColor: theme.borderActive,
                },
              }}
            >
              <box style={{ flexDirection: "column", gap: 0 }}>
                {cookies.map((cookie, i) => {
                  return (
                    <CookieRow
                      key={`${cookie.name}:${cookie.path}`}
                      id={`cookie-row-${i}`}
                      kindLabel="COOKIE"
                      kindColor={theme.secondary}
                      name={cookie.name}
                      value={cookie.value}
                      nameWidth={cookieNameColumnWidth}
                      selected={i === cookieIndex}
                      expanded={i === expandedCookieIndex}
                      hovered={hovered === i}
                      details={[
                        { label: "Value", value: cookie.value || "(empty)" },
                        ...cookieDetails(cookie),
                      ]}
                      onSelect={() => view.selectCookie(i)}
                      onToggleExpanded={() => view.toggleCookieExpanded(i)}
                      onHover={(isHovered) => setHovered(isHovered ? i : null)}
                      onPaneFocus={onPaneFocus}
                    />
                  )
                })}
              </box>
            </scrollbox>
          )}
        </>
      )}
    </Frame>
  )
}
