import type { ReactNode } from "react"
import { useTheme, contrastOnPrimary } from "./theme"

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
    <box style={{ flexDirection: "column", gap: 1, flexGrow: 1 }}>
      <box style={{ flexDirection: "row", gap: 1 }}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeId
          const label = tab.label
          return (
            <text
              key={tab.id}
              fg={isActive ? contrastOnPrimary(theme) : theme.textMuted}
              bg={isActive ? theme.primary : undefined}
            >
              {label}
            </text>
          )
        })}
      </box>
      {children}
    </box>
  )
}
