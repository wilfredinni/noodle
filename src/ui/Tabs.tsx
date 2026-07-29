import type { ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useRef, type ReactNode } from "react"
import { JumpBadge } from "./JumpBadge"
import { useTheme } from "./theme"

export type TabDef = {
  id: string
  label: string
  jumpHint?: string
}

export function Tabs({
  tabs,
  activeId,
  children,
  rightChildren,
}: {
  tabs: TabDef[]
  activeId: string
  children: ReactNode
  rightChildren?: ReactNode
}) {
  const theme = useTheme()
  const tabScrollRef = useRef<ScrollBoxRenderable | null>(null)
  const badgeScrollRef = useRef<ScrollBoxRenderable | null>(null)
  const hasJumpHint = tabs.some((t) => t.jumpHint)
  const scrollTabs = (delta: number) => {
    tabScrollRef.current?.scrollBy({ x: delta, y: 0 })
  }

  useEffect(() => {
    if (!hasJumpHint) return
    const scrollbar = tabScrollRef.current?.horizontalScrollBar
    if (!scrollbar) return
    const syncBadgeScroll = () => {
      badgeScrollRef.current?.scrollTo({
        x: tabScrollRef.current?.scrollLeft ?? 0,
        y: 0,
      })
    }
    scrollbar.on("change", syncBadgeScroll)
    syncBadgeScroll()
    return () => {
      scrollbar.off("change", syncBadgeScroll)
    }
  }, [hasJumpHint])

  useEffect(() => {
    const timer = setTimeout(() => {
      const scrollbox = tabScrollRef.current
      const tab = scrollbox?.content.findDescendantById(`tab-${activeId}`)
      if (!scrollbox || !tab) return

      const viewportLeft = scrollbox.viewport.x
      const viewportRight = viewportLeft + scrollbox.viewport.width
      const tabRight = tab.x + tab.width
      const delta =
        tab.width >= scrollbox.viewport.width || tab.x < viewportLeft
          ? tab.x - viewportLeft
          : tabRight > viewportRight
            ? tabRight - viewportRight
            : 0
      if (delta !== 0) scrollbox.scrollBy({ x: delta, y: 0 })
    })
    return () => clearTimeout(timer)
  }, [activeId])

  return (
    <box style={{ flexDirection: "column", flexGrow: 1, gap: 0, minHeight: 0 }}>
      <box
        style={{
          flexDirection: "row",
          gap: 0,
          flexShrink: 0,
          position: "relative",
          overflow: "visible",
          backgroundColor: theme.backgroundPanel,
        }}
      >
        <box
          border={["bottom"]}
          borderColor={theme.borderSubtle}
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 1,
          }}
        />
        <box
          style={{
            flexDirection: "column",
            flexGrow: 1,
            flexBasis: 0,
            minWidth: 0,
            height: 2,
            position: "relative",
            overflow: "visible",
          }}
        >
          {hasJumpHint ? (
            <scrollbox
              ref={badgeScrollRef}
              scrollX
              focusable={false}
              contentOptions={{ flexDirection: "row" }}
              scrollbarOptions={{ visible: false }}
              horizontalScrollbarOptions={{ visible: false }}
              style={{
                position: "absolute",
                top: -1,
                left: 0,
                right: 0,
                height: 1,
              }}
            >
              {tabs.map((tab) => (
                <box
                  key={tab.id}
                  style={{
                    flexDirection: "column",
                    flexBasis: "auto",
                    flexGrow: 0,
                    flexShrink: 0,
                    position: "relative",
                  }}
                >
                  {tab.jumpHint ? (
                    <JumpBadge
                      letter={tab.jumpHint}
                      style={{ top: 0, left: 0 }}
                    />
                  ) : null}
                  <box style={{ paddingLeft: 1, paddingRight: 2 }}>
                    <text opacity={0}>{tab.label}</text>
                  </box>
                </box>
              ))}
            </scrollbox>
          ) : null}
          {hasJumpHint ? (
            <box
              shouldFill={false}
              onMouseDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
              onMouseScroll={(event) => {
                const direction = event.scroll?.direction
                if (!direction) return
                const amount = event.scroll?.delta || 1
                const delta =
                  (direction === "left" || direction === "up" ? -1 : 1) * amount
                scrollTabs(delta)
                event.preventDefault()
                event.stopPropagation()
              }}
              style={{
                position: "absolute",
                top: -1,
                left: 0,
                right: 0,
                height: 1,
                zIndex: 101,
              }}
            />
          ) : null}
          <scrollbox
            ref={tabScrollRef}
            scrollX
            contentOptions={{ flexDirection: "row" }}
            scrollbarOptions={{ visible: false }}
            horizontalScrollbarOptions={{ visible: false }}
            style={{ height: 2 }}
          >
            {tabs.map((tab) => {
              const isActive = tab.id === activeId
              return (
                <box
                  id={`tab-${tab.id}`}
                  key={tab.id}
                  onMouseScroll={(event) => {
                    const direction = event.scroll?.direction
                    if (!direction) return
                    const amount = event.scroll?.delta || 1
                    const delta =
                      (direction === "left" || direction === "up" ? -1 : 1) *
                      amount
                    scrollTabs(delta)
                    event.preventDefault()
                    event.stopPropagation()
                  }}
                  style={{
                    flexDirection: "column",
                    flexBasis: "auto",
                    flexGrow: 0,
                    flexShrink: 0,
                  }}
                >
                  <box
                    style={{
                      paddingLeft: 1,
                      paddingRight: 2,
                    }}
                  >
                    <text fg={isActive ? theme.primary : theme.textMuted}>
                      {tab.label}
                    </text>
                  </box>
                  <box
                    border={["bottom"]}
                    borderColor={isActive ? theme.primary : theme.borderSubtle}
                  />
                </box>
              )
            })}
          </scrollbox>
        </box>
        <box style={{ flexDirection: "column", flexShrink: 0 }}>
          <box
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
            }}
          >
            {rightChildren ? rightChildren : <text> </text>}
          </box>
          <box border={["bottom"]} borderColor={theme.borderSubtle} />
        </box>
      </box>
      {children}
    </box>
  )
}
