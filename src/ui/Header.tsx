import { MouseButton, TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { stringWidth } from "bun"
import { useState } from "react"
import pkg from "../../package.json" with { type: "json" }
import type { UpdateFlowState } from "./appState"
import type { EnvStatus } from "./envIndicator"
import { truncateToWidth } from "./format"
import { useTheme } from "./theme"
import { getUpdateStatusSegments, UpdateStatusSpans } from "./UpdateStatus"

export function Header({
  collectionLabel,
  envLabel,
  envStatus,
  envColor,
  onAboutActivate,
  onCollectionActivate,
  onEnvironmentActivate,
  updateFlow = { phase: "idle" },
}: {
  collectionLabel: string
  envLabel: string
  envStatus: EnvStatus
  envColor?: string
  onAboutActivate?: () => void
  onCollectionActivate?: () => void
  onEnvironmentActivate?: () => void
  updateFlow?: UpdateFlowState
}) {
  const theme = useTheme()
  const [hoveringAbout, setHoveringAbout] = useState(false)
  const [hoveringCollection, setHoveringCollection] = useState(false)
  const [hoveringEnvironment, setHoveringEnvironment] = useState(false)
  const { width: termWidth = 100 } = useTerminalDimensions()

  const showVersion = termWidth >= 60
  const showCollection = termWidth >= 20
  const showEnvironment = termWidth >= 30
  const statusSegments =
    termWidth >= 80
      ? getUpdateStatusSegments(updateFlow, true).map((segment, index) =>
          index === 0
            ? { ...segment, text: segment.text.trimStart() }
            : segment,
        )
      : []
  const status = statusSegments.map(({ text }) => text).join("")
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
  const collectionText = truncateToWidth(rawCollectionText, collectionTextWidth)
  const envText = truncateToWidth(rawEnvText, environmentTextWidth)
  const environmentEnabled = onEnvironmentActivate !== undefined
  const envMarkerFg = !environmentEnabled
    ? theme.textMuted
    : envStatus === "error"
      ? theme.error
      : envStatus === "none"
        ? theme.textMuted
        : envColor !== undefined
          ? ((theme as unknown as Record<string, string>)[envColor] ??
            theme.info)
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
        {showVersion && statusSegments.length > 0 && (
          <text selectable={false}>
            <UpdateStatusSpans segments={statusSegments} />
          </text>
        )}
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
              fg={
                !environmentEnabled || envStatus === "none"
                  ? theme.textMuted
                  : theme.text
              }
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
