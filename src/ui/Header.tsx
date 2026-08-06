import { MouseButton, TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { stringWidth } from "bun"
import { useState } from "react"
import pkg from "../../package.json" with { type: "json" }
import { useTheme } from "./theme"

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })

function truncate(text: string, maxWidth: number): string {
  if (stringWidth(text) <= maxWidth) return text
  if (maxWidth <= 1) return maxWidth === 1 ? "…" : ""

  let result = ""
  let width = 0
  for (const { segment } of graphemes.segment(text)) {
    const segmentWidth = stringWidth(segment)
    if (width + segmentWidth > maxWidth - 1) break
    result += segment
    width += segmentWidth
  }
  return `${result}…`
}

export function Header({
  envLabel,
  envColor,
  onAboutActivate,
  onEnvironmentActivate,
  restartVersion,
  updateAvailable,
}: {
  envLabel: string
  envColor?: string
  onAboutActivate?: () => void
  onEnvironmentActivate?: () => void
  restartVersion?: string | null
  updateAvailable?: string | null
}) {
  const theme = useTheme()
  const [hoveringAbout, setHoveringAbout] = useState(false)
  const [hoveringEnvironment, setHoveringEnvironment] = useState(false)
  const { width: termWidth = 100 } = useTerminalDimensions()

  const showVersion = termWidth >= 60
  const status = showVersion
    ? updateAvailable != null
      ? " ✨ Update available"
      : restartVersion
        ? " ✨ Restart to update"
        : ""
    : ""
  const titleWidth = 8 + (showVersion ? ` v${pkg.version}`.length : 0)
  const availableEnvironmentWidth = Math.max(
    0,
    termWidth - titleWidth - status.length - 4,
  )
  const rawEnvText =
    envLabel === "" || envLabel === "(no env)" ? "no env" : envLabel
  const envText = truncate(
    rawEnvText,
    Math.max(0, availableEnvironmentWidth - 2),
  )
  const envMarkerFg = envLabel.includes("(load failed")
    ? theme.error
    : envLabel === "" || envLabel === "(no env)"
      ? theme.textMuted
      : envColor !== undefined
        ? ((theme as unknown as Record<string, string>)[envColor] ?? theme.info)
        : theme.info

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
      {availableEnvironmentWidth > 0 && (
        <box
          style={{
            flexDirection: "row",
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor: hoveringEnvironment
              ? theme.backgroundElement
              : undefined,
          }}
          onMouseDown={(event) => {
            if (event.button === MouseButton.LEFT) {
              setHoveringEnvironment(false)
              onEnvironmentActivate?.()
            }
          }}
          onMouseOver={
            onEnvironmentActivate
              ? () => setHoveringEnvironment(true)
              : undefined
          }
          onMouseOut={
            onEnvironmentActivate
              ? () => setHoveringEnvironment(false)
              : undefined
          }
        >
          <text fg={envMarkerFg} selectable={false}>
            ⛁
          </text>
          {envText !== "" && (
            <text
              fg={rawEnvText === "no env" ? theme.textMuted : theme.text}
              selectable={false}
            >
              {` ${envText}`}
            </text>
          )}
        </box>
      )}
    </box>
  )
}
