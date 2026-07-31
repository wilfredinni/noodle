import { MouseButton, TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { useState } from "react"
import pkg from "../../package.json" with { type: "json" }
import { useTheme } from "./theme"
import type { HintSegment } from "./keybindingHints"

export function Header({
  headerHints,
  onAboutActivate,
  onHintActivate,
  restartVersion,
  updateAvailable,
}: {
  headerHints: HintSegment[]
  onAboutActivate?: () => void
  onHintActivate?: (command: string) => void
  restartVersion?: string | null
  updateAvailable?: string | null
}) {
  const theme = useTheme()
  const [hoveringAbout, setHoveringAbout] = useState(false)
  const [hoveredHint, setHoveredHint] = useState<number | null>(null)
  const { width: termWidth = 100 } = useTerminalDimensions()

  const showVersion = termWidth >= 45
  const showHints = termWidth >= 35
  const showHintLabels = termWidth >= 60
  const status = showVersion
    ? updateAvailable != null
      ? " ✨ Update available"
      : restartVersion
        ? " ✨ Restart to update"
        : ""
    : ""
  const titleWidth = 8 + (showVersion ? ` v${pkg.version}`.length : 0)
  const availableHintWidth = termWidth - 2 - titleWidth - status.length
  let usedHintWidth = 0
  const visibleHints = showHints
    ? headerHints.filter((hint) => {
        const width =
          hint.key.length +
          (showHintLabels && hint.word ? hint.word.length + 1 : 0) +
          2 +
          (usedHintWidth === 0 ? 0 : 1)
        if (usedHintWidth + width > availableHintWidth) return false
        usedHintWidth += width
        return true
      })
    : []

  return (
    <box
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        flexShrink: 0,
        backgroundColor: theme.backgroundPanel,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <box style={{ flexDirection: "row" }}>
        <box
          style={{
            flexDirection: "row",
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor: hoveringAbout
              ? theme.backgroundElement
              : undefined,
          }}
          onMouseDown={(event) => {
            if (event.button === MouseButton.LEFT) {
              setHoveringAbout(false)
              onAboutActivate?.()
            }
          }}
          onMouseOver={
            onAboutActivate ? () => setHoveringAbout(true) : undefined
          }
          onMouseOut={
            onAboutActivate ? () => setHoveringAbout(false) : undefined
          }
        >
          <text
            fg={theme.primary}
            attributes={TextAttributes.BOLD}
            selectable={false}
          >
            Noodle
          </text>
          {showVersion && (
            <text fg={theme.textMuted} selectable={false}>
              {` v${pkg.version}`}
            </text>
          )}
        </box>
        {showVersion && status && <text fg={theme.warning}>{status}</text>}
      </box>
      {visibleHints.length > 0 && (
        <box style={{ flexDirection: "row", gap: 1 }}>
          {visibleHints.map((hint) => {
            const i = headerHints.indexOf(hint)
            return (
              <box
                key={i}
                style={{
                  flexDirection: "row",
                  paddingLeft: 1,
                  paddingRight: 1,
                  backgroundColor:
                    hint.command && onHintActivate && hoveredHint === i
                      ? theme.backgroundElement
                      : undefined,
                }}
                onMouseDown={(event) => {
                  if (event.button === MouseButton.LEFT && hint.command) {
                    setHoveredHint(null)
                    onHintActivate?.(hint.command)
                  }
                }}
                onMouseOver={
                  hint.command && onHintActivate
                    ? () => setHoveredHint(i)
                    : undefined
                }
                onMouseOut={
                  hint.command && onHintActivate
                    ? () => setHoveredHint(null)
                    : undefined
                }
              >
                <text fg={theme.text} selectable={false}>
                  {hint.key}
                </text>
                {showHintLabels && hint.word ? (
                  <text fg={theme.textMuted} selectable={false}>
                    {` ${hint.word}`}
                  </text>
                ) : null}
              </box>
            )
          })}
        </box>
      )}
    </box>
  )
}
