import { useMemo } from "react"
import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import pkg from "../../package.json" with { type: "json" }
import { useTheme } from "./theme"
import { displayKey, type Keybinds } from "./keybind"

export function Header({
  view,
  overlayActive,
  jumpMode,
  keybinds,
  restartVersion,
  updateAvailable,
}: {
  view: "main" | "env-editor"
  overlayActive: boolean
  jumpMode: boolean
  keybinds: Keybinds
  restartVersion?: string | null
  updateAvailable?: string | null
}) {
  const theme = useTheme()
  const { width: termWidth = 100 } = useTerminalDimensions()

  const headerHints = useMemo(() => {
    if (overlayActive) {
      return [{ key: "Esc", word: "close" }]
    }
    if (jumpMode) {
      return [
        { key: "Type key", word: "to jump" },
        { key: "Esc", word: "dismiss" },
      ]
    }
    if (view === "env-editor") {
      return [
        { key: displayKey(keybinds.command_palette), word: "commands" },
        { key: displayKey(keybinds.help_toggle), word: "help" },
      ]
    }
    return [
      { key: displayKey(keybinds.jump_mode), word: "jump" },
      { key: displayKey(keybinds.command_palette), word: "commands" },
      { key: displayKey(keybinds.help_toggle), word: "help" },
    ]
  }, [overlayActive, jumpMode, view, keybinds])

  const showVersion = termWidth >= 45
  const showHints = termWidth >= 35
  const showHintLabels = termWidth >= 60

  return (
    <box
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        flexShrink: 0,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <box style={{ flexDirection: "row" }}>
        <text fg={theme.primary} attributes={TextAttributes.BOLD}>
          Noodle
        </text>
        {showVersion && <text fg={theme.textMuted}> v{pkg.version}</text>}
        {showVersion && updateAvailable !== null && (
          <text fg={theme.warning}>
            {" "}
            {"->"} {updateAvailable || "update available"}
          </text>
        )}
        {showVersion && restartVersion && (
          <text fg={theme.warning}> Restart to update</text>
        )}
      </box>
      {showHints && headerHints.length > 0 && (
        <box style={{ flexDirection: "row" }}>
          {headerHints.map((hint, i) => (
            <box key={i} style={{ flexDirection: "row" }}>
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
