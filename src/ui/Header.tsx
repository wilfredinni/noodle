import { MouseButton, TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
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
          style={{ flexDirection: "row" }}
          onMouseDown={(event) => {
            if (event.button === MouseButton.LEFT) onAboutActivate?.()
          }}
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
        <box style={{ flexDirection: "row" }}>
          {headerHints.map((hint, i) => (
            <box
              key={i}
              style={{ flexDirection: "row" }}
              onMouseDown={(event) => {
                if (event.button === MouseButton.LEFT && hint.command) {
                  onHintActivate?.(hint.command)
                }
              }}
            >
              <text fg={theme.text}>{hint.key}</text>
              {showHintLabels && hint.word ? (
                <text fg={theme.textMuted}> {hint.word}</text>
              ) : null}
              {i < headerHints.length - 1 && (
                <text fg={theme.textMuted}> · </text>
              )}
            </box>
          ))}
        </box>
      )}
    </box>
  )
}
