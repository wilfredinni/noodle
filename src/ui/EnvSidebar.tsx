import { useTheme } from "./theme"
import { FullBorder } from "./borders"
import { ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useRef } from "react"

export function EnvSidebar({
  envNames,
  selectedEnvName,
  activeEnvName,
  dirty,
  onSelectEnv: _onSelectEnv,
  onCreate: _onCreate,
  onClone: _onClone,
  onDelete: _onDelete,
  focused,
}: {
  envNames: string[]
  selectedEnvName: string | null
  activeEnvName: string | undefined
  dirty: boolean
  onSelectEnv: (name: string) => void
  onCreate: () => void
  onClone: () => void
  onDelete: () => void
  focused: boolean
}) {
  const theme = useTheme()
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)

  const selectedIndex = selectedEnvName ? envNames.indexOf(selectedEnvName) : -1

  useEffect(() => {
    if (selectedIndex >= 0) {
      scrollRef.current?.scrollChildIntoView(`env-${selectedIndex}`)
    }
  }, [selectedIndex])

  return (
    <box
      style={{
        width: 30,
        flexDirection: "column",
        flexShrink: 0,
        backgroundColor: theme.backgroundPanel,
        padding: 1,
        gap: 1,
      }}
      border={[...FullBorder.border]}
      customBorderChars={FullBorder.customBorderChars}
      borderColor={focused ? theme.primary : theme.borderSubtle}
      title="Environments"
      titleColor={focused ? theme.primary : theme.textMuted}
      titleAlignment="left"
    >
      {envNames.length === 0 ? (
        <text fg={theme.textMuted}>(no environments)</text>
      ) : (
        <scrollbox
          ref={scrollRef}
          scrollY
          key={envNames.join("|")}
          style={{ flexGrow: 1 }}
          verticalScrollbarOptions={{
            trackOptions: {
              backgroundColor: theme.background,
              foregroundColor: theme.borderActive,
            },
          }}
        >
          {envNames.map((name, i) => {
            const isSelected = name === selectedEnvName
            const isActive = name === activeEnvName
            const isDirty = isSelected && dirty
            return (
              <box
                key={name}
                id={`env-${i}`}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  backgroundColor: isSelected
                    ? theme.backgroundElement
                    : undefined,
                }}
              >
                <text fg={isActive ? theme.text : theme.textMuted}>{name}</text>
                {isDirty && <text fg={theme.warning}>●</text>}
              </box>
            )
          })}
        </scrollbox>
      )}
    </box>
  )
}
