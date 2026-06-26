import type { ReactNode } from "react"
import { useTheme } from "./theme"

export type TabDef = {
  id: string
  label: string
}

export function Tabs({
  tabs,
  activeId,
  children,
}: {
  tabs: TabDef[]
  activeId: string
  children: ReactNode
}) {
  const theme = useTheme()
  return (
    <box style={{ flexDirection: "column", flexGrow: 1, gap: 0 }}>
      <box
        style={{
          flexDirection: "row",
          gap: 0,
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
              }}
            >
              <box style={{ paddingLeft: 1, paddingRight: 3 }}>
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
          <text> </text>
          <box border={["bottom"]} borderColor={theme.borderSubtle} />
        </box>
      </box>
      {children}
    </box>
  )
}
