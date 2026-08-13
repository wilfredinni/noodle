import { useTheme } from "../theme"
import { FullBorder } from "../borders"
import { useEffect, useRef, useState } from "react"
import {
  MouseButton,
  type InputRenderable,
  type ScrollBoxRenderable,
} from "@opentui/core"
import { Frame } from "../Frame"
import { Badge } from "../Badge"
import { JumpBadge, JUMP_BADGE_TOP_INDENT } from "../JumpBadge"
import type { CookieJarStatus, JarCookie } from "../../cookies"
import type { UseCookieJarViewResult } from "../../hooks/useCookieJarView"

function expiresLabel(cookie: JarCookie): string {
  if (cookie.expires === null) return "session"
  const date = cookie.expires.toISOString().slice(0, 10)
  return cookie.expires.getTime() < Date.now() ? `expired ${date}` : date
}

function flags(cookie: JarCookie): string {
  const parts: string[] = []
  if (cookie.httpOnly) parts.push("HttpOnly")
  if (cookie.secure) parts.push("Secure")
  parts.push(cookie.hostOnly ? "HostOnly" : "Domain")
  if (cookie.sameSite) parts.push(cookie.sameSite)
  return parts.join(" ")
}

export function CookieJarPane({
  view,
  status,
  domain,
  focused,
  jumpMode = false,
  onPaneFocus,
  onRetry,
  onReset,
}: {
  view: UseCookieJarViewResult
  status: CookieJarStatus
  domain: string | null
  focused: boolean
  jumpMode?: boolean
  onPaneFocus?: () => void
  onRetry?: () => void
  onReset?: () => void
}) {
  const theme = useTheme()
  const cookies = view.cookies
  const cookieIndex = view.cookieIndex
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const filterRef = useRef<InputRenderable | null>(null)

  const panelNum = parseInt(theme.backgroundPanel.slice(1), 16)
  const elemNum = parseInt(theme.backgroundElement.slice(1), 16)
  const stripeR = Math.round(
    (((panelNum >> 16) & 0xff) + ((elemNum >> 16) & 0xff)) / 2,
  )
  const stripeG = Math.round(
    (((panelNum >> 8) & 0xff) + ((elemNum >> 8) & 0xff)) / 2,
  )
  const stripeB = Math.round(((panelNum & 0xff) + (elemNum & 0xff)) / 2)
  const stripeBg = `#${stripeR.toString(16).padStart(2, "0")}${stripeG.toString(16).padStart(2, "0")}${stripeB.toString(16).padStart(2, "0")}`

  useEffect(() => {
    if (cookieIndex >= 0) {
      scrollRef.current?.scrollChildIntoView(`cookie-row-${cookieIndex}`)
    }
  }, [cookieIndex])

  useEffect(() => {
    if (view.filtering) filterRef.current?.focus()
  }, [view.filtering])

  return (
    <Frame
      style={{
        flexDirection: "column",
        flexGrow: 1,
        minHeight: 0,
        padding: 1,
        gap: 1,
        backgroundColor: theme.backgroundPanel,
      }}
      border={[...FullBorder.border]}
      customBorderChars={FullBorder.customBorderChars}
      borderColor={focused ? theme.primary : theme.borderSubtle}
      titleRight={
        jumpMode ? undefined : (
          <Badge
            bg={theme.backgroundPanel}
            fg={focused ? theme.primary : theme.textMuted}
          >
            {domain ?? "Cookies"}
          </Badge>
        )
      }
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
              <text fg={theme.error}>Reset with backup (^K)</text>
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
            <>
              <box style={{ flexDirection: "row", paddingY: 0 }}>
                <text fg={theme.textMuted} width={16} wrapMode="none" truncate>
                  Name
                </text>
                <text fg={theme.textMuted} width={30} wrapMode="none" truncate>
                  Value
                </text>
                <text fg={theme.textMuted} width={12} wrapMode="none" truncate>
                  Path
                </text>
                <text fg={theme.textMuted} width={12} wrapMode="none" truncate>
                  Expires
                </text>
                <text fg={theme.textMuted} wrapMode="none" truncate>
                  Flags
                </text>
              </box>
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
                {cookies.map((cookie, i) => {
                  const isSelected = i === cookieIndex
                  const isHovered = hovered === i
                  const rowBg =
                    isSelected || isHovered
                      ? theme.backgroundElement
                      : i % 2 !== 0
                        ? stripeBg
                        : undefined
                  return (
                    <box
                      key={`${cookie.name}:${cookie.path}`}
                      id={`cookie-row-${i}`}
                      style={{
                        flexDirection: "row",
                        paddingY: 0,
                        backgroundColor: rowBg,
                      }}
                      onMouseDown={(event) => {
                        event.stopPropagation()
                        if (event.button === MouseButton.LEFT) {
                          view.selectCookie(i)
                        }
                        onPaneFocus?.()
                      }}
                      onMouseOver={() => setHovered(i)}
                      onMouseOut={() => setHovered(null)}
                    >
                      <text
                        fg={isSelected ? theme.primary : theme.text}
                        width={16}
                        wrapMode="none"
                        truncate
                      >
                        {cookie.name}
                      </text>
                      <text
                        fg={theme.textMuted}
                        width={30}
                        wrapMode="none"
                        truncate
                      >
                        {cookie.value}
                      </text>
                      <text
                        fg={theme.textMuted}
                        width={12}
                        wrapMode="none"
                        truncate
                      >
                        {cookie.path}
                      </text>
                      <text
                        fg={theme.textMuted}
                        width={12}
                        wrapMode="none"
                        truncate
                      >
                        {expiresLabel(cookie)}
                      </text>
                      <text fg={theme.textMuted} wrapMode="none" truncate>
                        {flags(cookie)}
                      </text>
                    </box>
                  )
                })}
              </scrollbox>
            </>
          )}
        </>
      )}
    </Frame>
  )
}
