import { useTheme } from "../theme"
import { FullBorder, LeftBar } from "../borders"
import { useEffect, useRef, useState } from "react"
import { MouseButton, type ScrollBoxRenderable } from "@opentui/core"
import { Frame } from "../Frame"
import { JumpBadge, JUMP_BADGE_TOP_INDENT } from "../JumpBadge"
import type { CookieDomainGroup } from "../../hooks/useCookieJarView"

export function CookieJarSidebar({
  domains,
  selectedDomain,
  domainIndex,
  focused,
  jumpMode = false,
  onSelectDomain,
  onPaneFocus,
}: {
  domains: CookieDomainGroup[]
  selectedDomain: string | null
  domainIndex: number
  focused: boolean
  jumpMode?: boolean
  onSelectDomain: (domain: string) => void
  onPaneFocus?: () => void
}) {
  const theme = useTheme()
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const [hoveredDomain, setHoveredDomain] = useState<string | null>(null)

  useEffect(() => {
    if (domainIndex >= 0) {
      scrollRef.current?.scrollChildIntoView(`cookie-domain-${domainIndex}`)
    }
  }, [domainIndex])

  return (
    <Frame
      style={{
        width: 40,
        flexDirection: "column",
        flexShrink: 0,
        backgroundColor: theme.backgroundPanel,
        paddingTop: 0,
        paddingBottom: 1,
        paddingLeft: 1,
        paddingRight: 1,
      }}
      border={[...FullBorder.border]}
      customBorderChars={FullBorder.customBorderChars}
      borderColor={focused ? theme.primary : theme.borderSubtle}
      onPaneFocus={onPaneFocus}
    >
      {jumpMode && <JumpBadge letter="s" style={JUMP_BADGE_TOP_INDENT} />}
      {domains.length === 0 ? (
        <text fg={theme.textMuted}>(no cookies)</text>
      ) : (
        <scrollbox
          ref={scrollRef}
          scrollY
          key={domains.map((d) => d.domain).join("|")}
          style={{ flexGrow: 1 }}
          verticalScrollbarOptions={{
            trackOptions: {
              backgroundColor: theme.background,
              foregroundColor: theme.borderActive,
            },
          }}
        >
          {domains.map((group, i) => {
            const isSelected = group.domain === selectedDomain
            const isHovered = hoveredDomain === group.domain
            return (
              <box
                key={group.domain}
                id={`cookie-domain-${i}`}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingLeft: 1,
                  backgroundColor:
                    isSelected || isHovered
                      ? theme.backgroundElement
                      : undefined,
                }}
                border={[...LeftBar.border]}
                customBorderChars={LeftBar.customBorderChars}
                borderColor={isSelected ? theme.primary : theme.backgroundPanel}
                onMouseDown={(event) => {
                  if (event.button === MouseButton.LEFT) {
                    onSelectDomain(group.domain)
                    onPaneFocus?.()
                  }
                  event.stopPropagation()
                }}
                onMouseOver={() => setHoveredDomain(group.domain)}
                onMouseOut={() => setHoveredDomain(null)}
              >
                <text fg={theme.text} wrapMode="none" truncate>
                  {group.domain}
                </text>
              </box>
            )
          })}
        </scrollbox>
      )}
    </Frame>
  )
}
