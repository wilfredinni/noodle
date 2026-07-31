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
            if (event.button === MouseButton.LEFT) onAboutActivate?.()
          }}
          onMouseOver={
            onAboutActivate ? () => setHoveringAbout(true) : undefined
          }
          onMouseOut={
            onAboutActivate ? () => setHoveringAbout(false) : undefined
          }
        >
          <text fg={theme.primary} attributes={TextAttributes.BOLD}>
            Noodle
          </text>
          {showVersion && <text fg={theme.textMuted}> v{pkg.version}</text>}
        </box>
        {showVersion && updateAvailable != null && (
          <text fg={theme.warning}> {"✨"} Update available</text>
        )}
        {showVersion && restartVersion && (
          <text fg={theme.warning}> ✨ Restart to update</text>
        )}
      </box>
      {showHints && headerHints.length > 0 && (
        <box style={{ flexDirection: "row", gap: 1 }}>
          {headerHints.map((hint, i) => (
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
              <text fg={theme.text}>{hint.key}</text>
              {showHintLabels && hint.word ? (
                <text fg={theme.textMuted}> {hint.word}</text>
              ) : null}
            </box>
          ))}
        </box>
      )}
    </box>
  )
}
