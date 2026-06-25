import { TextAttributes } from "@opentui/core"
import type { ReactNode } from "react"

export type TabDef = {
  id: string
  label: string
}

export function Tabs({
  tabs,
  activeId,
  focused = false,
  children,
}: {
  tabs: TabDef[]
  activeId: string
  focused?: boolean
  children: ReactNode
}) {
  return (
    <box style={{ flexDirection: "column", gap: 1, flexGrow: 1 }}>
      <box style={{ flexDirection: "row", gap: 1 }}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeId
          const label = isActive && focused ? `▸ ${tab.label}` : tab.label
          return (
            <text
              key={tab.id}
              attributes={isActive ? TextAttributes.INVERSE : 0}
              fg={isActive ? undefined : "#888"}
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
