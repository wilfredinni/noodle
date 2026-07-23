import type { ReactNode } from "react"
import { useTheme } from "./theme"
import { JumpBadge } from "./JumpBadge"

export type TabDef = {
  id: string
  label: string
}

export function Tabs({
  tabs,
  activeId,
  children,
  rightChildren,
  hints,
  jumpMode = false,
  jumpBadgeKeys,
}: {
  tabs: TabDef[]
  activeId: string
  children: ReactNode
  rightChildren?: ReactNode
  hints?: Record<string, string>
  jumpMode?: boolean
  jumpBadgeKeys?: Set<string>
}) {
  const theme = useTheme()
  return (
    <box style={{ flexDirection: "column", flexGrow: 1, gap: 0, minHeight: 0 }}>
      <box
        style={{
          flexDirection: "row",
          gap: 0,
          flexShrink: 0,
          backgroundColor: theme.backgroundPanel,
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeId
          const hint = hints?.[tab.id]
          return (
            <box
              key={tab.id}
              style={{
                flexDirection: "column",
                flexShrink: 0,
                position: "relative",
              }}
            >
              {jumpMode && hint && jumpBadgeKeys?.has(hint) ? (
                <JumpBadge letter={hint} style={{ top: -1, left: 0 }} />
              ) : null}
              <box
                style={{
                  paddingLeft: 1,
                  paddingRight: 2,
                  flexDirection: "row",
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
        <box style={{ flexDirection: "column", flexGrow: 1 }}>
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
