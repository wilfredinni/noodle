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
  collectionLabel,
  envLabel,
  envColor,
  onAboutActivate,
  onCollectionActivate,
  onEnvironmentActivate,
  restartVersion,
  updateAvailable,
}: {
  collectionLabel: string
  envLabel: string
  envColor?: string
  onAboutActivate?: () => void
  onCollectionActivate?: () => void
  onEnvironmentActivate?: () => void
  restartVersion?: string | null
  updateAvailable?: string | null
}) {
  const theme = useTheme()
  const [hoveringAbout, setHoveringAbout] = useState(false)
  const [hoveringCollection, setHoveringCollection] = useState(false)
  const [hoveringEnvironment, setHoveringEnvironment] = useState(false)
  const { width: termWidth = 100 } = useTerminalDimensions()

  const showVersion = termWidth >= 60
  const showStatus = termWidth >= 80
  const showCollection = termWidth >= 20
  const showEnvironment = termWidth >= 30
  const status = showStatus
    ? updateAvailable != null
      ? " ✨ Update available"
      : restartVersion
        ? " ✨ Restart to update"
        : ""
    : ""
  const titleWidth = 8 + (showVersion ? ` v${pkg.version}`.length : 0)
  const availableLabelWidth = Math.max(
    0,
    termWidth -
      titleWidth -
      stringWidth(status) -
      (showCollection ? 7 : 0) -
      (showEnvironment ? 4 : 0) -
      2,
  )
  const rawCollectionText = collectionLabel
  const rawEnvText =
    envLabel === "" || envLabel === "(no env)" ? "no env" : envLabel
  let environmentTextWidth = showEnvironment
    ? Math.min(stringWidth(rawEnvText), Math.ceil(availableLabelWidth / 2))
    : 0
  const collectionTextWidth = showCollection
    ? Math.min(
        stringWidth(rawCollectionText),
        availableLabelWidth - environmentTextWidth,
      )
    : 0
  environmentTextWidth = showEnvironment
    ? Math.min(
        stringWidth(rawEnvText),
        availableLabelWidth - collectionTextWidth,
      )
    : 0
  const collectionText = truncate(rawCollectionText, collectionTextWidth)
  const envText = truncate(rawEnvText, environmentTextWidth)
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
        {showCollection && (
          <>
            <text fg={theme.textMuted} selectable={false}>
              {" / "}
            </text>
            <box
              style={{
                flexDirection: "row",
                paddingLeft: 1,
                paddingRight: 1,
                backgroundColor: hoveringCollection
                  ? theme.backgroundElement
                  : undefined,
              }}
              onMouseDown={(event) => {
                if (event.button === MouseButton.LEFT) {
                  setHoveringCollection(false)
                  onCollectionActivate?.()
                }
              }}
              onMouseOver={
                onCollectionActivate
                  ? () => setHoveringCollection(true)
                  : undefined
              }
              onMouseOut={
                onCollectionActivate
                  ? () => setHoveringCollection(false)
                  : undefined
              }
            >
              <text
                fg={onCollectionActivate ? theme.text : theme.textMuted}
                selectable={false}
              >
                {`${collectionText} ▾`}
              </text>
            </box>
          </>
        )}
        {showVersion && status && <text fg={theme.warning}>{status}</text>}
      </box>
      {showEnvironment && (
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
