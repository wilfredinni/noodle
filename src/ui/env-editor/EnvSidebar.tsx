import { useTheme } from "../theme"
import { FullBorder, LeftBar } from "../borders"
import { ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useRef } from "react"
import { VALID_COLORS } from "../../env/constants"
import { Frame } from "../Frame"
import { Badge } from "../Badge"

export function EnvSidebar({
  envNames,
  selectedEnvName,
  activeEnvName: _activeEnvName,
  envColors,
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
  envColors?: Record<string, string | undefined>
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
    <Frame
      style={{
        width: 38,
        flexDirection: "column",
        flexShrink: 0,
        backgroundColor: theme.backgroundPanel,
        padding: 1,
        gap: 1,
      }}
      border={[...FullBorder.border]}
      customBorderChars={FullBorder.customBorderChars}
      borderColor={focused ? theme.primary : theme.borderSubtle}
      titleLeft={
        <Badge
          bg={theme.backgroundPanel}
          fg={focused ? theme.primary : theme.textMuted}
        >
          Environments
        </Badge>
      }
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
            const isDirty = isSelected && dirty
            const colorKey = envColors?.[name]
            const colorHex =
              colorKey !== undefined
                ? ((VALID_COLORS.has(colorKey)
                    ? (theme as unknown as Record<string, string>)[colorKey]
                    : undefined) ?? theme.textMuted)
                : undefined
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
                border={[...LeftBar.border]}
                customBorderChars={LeftBar.customBorderChars}
                borderColor={isSelected ? theme.primary : theme.backgroundPanel}
              >
                <box style={{ flexDirection: "row" }}>
                  {colorHex && <text fg={colorHex}>● </text>}
                  <text fg={theme.text}>{name}</text>
                </box>
                {isDirty && <text fg={theme.warning}>●</text>}
              </box>
            )
          })}
        </scrollbox>
      )}
    </Frame>
  )
}
