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
          gap: 2,
          backgroundColor: theme.backgroundPanel,
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeId
          return (
            <box
              key={tab.id}
              style={{ flexDirection: "column", paddingLeft: 1, paddingRight: 1 }}
            >
              <text fg={isActive ? theme.primary : theme.textMuted}>
                {isActive ? "▸ " : "  "}
                {tab.label}
              </text>
              {isActive ? (
                <box border={["bottom"]} borderColor={theme.primary} />
              ) : (
                <text> </text>
              )}
            </box>
          )
        })}
      </box>
      {children}
    </box>
  )
}
