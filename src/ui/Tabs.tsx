import type { ReactNode } from "react"
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
          return (
            <box
              key={tab.id}
              style={{
                flexDirection: "column",
                flexShrink: 0,
                position: "relative",
              }}
            >
              {tab.jumpHint ? (
                <JumpBadge letter={tab.jumpHint} style={{ top: -1, left: 0 }} />
              ) : null}
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
