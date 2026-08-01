import { useTheme } from "../theme"
import { FullBorder, LeftBar } from "../borders"
import { MouseButton, ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useRef, useState } from "react"
import { VALID_COLORS } from "../../env/constants"
import { Frame } from "../Frame"
import { Badge } from "../Badge"
import { JumpBadge, JUMP_BADGE_TOP_INDENT } from "../JumpBadge"

export function EnvSidebar({
  envNames,
  selectedEnvName,
  activeEnvName: _activeEnvName,
  envColors,
  dirty,
  onSelectEnv,
  onCreate: _onCreate,
  onClone: _onClone,
  onDelete: _onDelete,
  focused,
  jumpMode = false,
  onPaneFocus,
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
  jumpMode?: boolean
  onPaneFocus?: () => void
}) {
  const theme = useTheme()
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const [hoveredEnvName, setHoveredEnvName] = useState<string | null>(null)

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
      titleRight={
        jumpMode ? undefined : (
          <Badge
            bg={theme.backgroundPanel}
            fg={focused ? theme.primary : theme.textMuted}
          >
            Environments
          </Badge>
        )
      }
      onPaneFocus={onPaneFocus}
    >
      {jumpMode && <JumpBadge letter="s" style={JUMP_BADGE_TOP_INDENT} />}
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
            const isHovered = hoveredEnvName === name
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
                  backgroundColor:
                    isSelected || isHovered
                      ? theme.backgroundElement
                      : undefined,
                }}
                border={[...LeftBar.border]}
                customBorderChars={LeftBar.customBorderChars}
                borderColor={isSelected ? theme.primary : theme.backgroundPanel}
                onMouseDown={(event) => {
                  if (event.button !== MouseButton.LEFT) return
                  onSelectEnv(name)
                  onPaneFocus?.()
                  event.stopPropagation()
                }}
                onMouseOver={() => setHoveredEnvName(name)}
                onMouseOut={() => setHoveredEnvName(null)}
              >
                <box style={{ flexDirection: "row" }}>
                  {colorHex && <text fg={colorHex}>● </text>}
                  <text fg={theme.text}>{name}</text>
                </box>
                {isDirty && <text fg={theme.accent}>●</text>}
              </box>
            )
          })}
        </scrollbox>
      )}
    </Frame>
  )
}
