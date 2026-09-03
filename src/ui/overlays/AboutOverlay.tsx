import { MouseButton, TextAttributes } from "@opentui/core"
import { useState } from "react"
import pkg from "../../../package.json" with { type: "json" }
import { openSystemBrowser } from "../../requests/oauth2Browser"
import { showToast } from "../Toast"
import { useTheme } from "../theme"
import type { UpdateFlowState } from "../appState"
import { getUpdateStatusSegments, UpdateStatusSpans } from "../UpdateStatus"
import { Overlay } from "./Overlay"
import { EscapeClose } from "./EscapeClose"

function AboutLink({
  label,
  href,
  onOpen,
}: {
  label: string
  href: string
  onOpen: (href: string) => void
}) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)

  return (
    <box
      id={`about-link-${label.toLowerCase()}`}
      onMouseDown={(event) => {
        if (event.button !== MouseButton.LEFT) return
        onOpen(href)
        event.preventDefault()
        event.stopPropagation()
      }}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
      style={{
        backgroundColor: hovered ? theme.backgroundElement : undefined,
        paddingX: 1,
      }}
    >
      <text fg={hovered ? theme.text : theme.primary}>{label}</text>
    </box>
  )
}

function AboutVersion({ updateFlow }: { updateFlow: UpdateFlowState }) {
  const theme = useTheme()
  const segments = getUpdateStatusSegments(updateFlow)

  return (
    <text id="about-version" fg={theme.text}>
      Noodle v{pkg.version}
      <UpdateStatusSpans segments={segments} />
    </text>
  )
}

export function AboutOverlay({
  visible,
  onClose = () => {},
  onOpenLink = openSystemBrowser,
  updateFlow = { phase: "idle" },
}: {
  visible: boolean
  onClose?: () => void
  onOpenLink?: (href: string) => Promise<void> | void
  updateFlow?: UpdateFlowState
}) {
  const theme = useTheme()
  const openLink = (href: string) => {
    void Promise.resolve(onOpenLink(href)).catch(() => {
      showToast("Unable to open link", "error")
    })
  }

  return (
    <Overlay visible={visible} width={72} gap={1} padding={1} onClose={onClose}>
      <box
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingBottom: 1,
          paddingX: 2,
        }}
      >
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          About
        </text>
        <EscapeClose onClose={onClose} />
      </box>
      <box
        style={{
          alignItems: "center",
          flexDirection: "column",
          gap: 1,
          paddingX: 2,
          paddingY: 1,
        }}
      >
        <ascii-font
          id="about-title"
          text="Noodle"
          font="block"
          color={theme.primary}
          selectable={false}
        />
        <AboutVersion updateFlow={updateFlow} />
        <text fg={theme.textMuted}>
          Free, open-source REST client that runs entirely in your terminal.
        </text>
        <box style={{ flexDirection: "row", alignItems: "center" }}>
          <AboutLink
            label="GitHub"
            href="https://github.com/wilfredinni/noodle"
            onOpen={openLink}
          />
          <text fg={theme.textMuted}> · </text>
          <AboutLink
            label="Releases"
            href="https://github.com/wilfredinni/noodle/releases"
            onOpen={openLink}
          />
          <text fg={theme.textMuted}> · </text>
          <AboutLink
            label="Website"
            href="https://noodlerest.dev/"
            onOpen={openLink}
          />
          <text fg={theme.textMuted}> · </text>
          <AboutLink
            label="Docs"
            href="https://noodlerest.dev/docs/"
            onOpen={openLink}
          />
        </box>
      </box>
    </Overlay>
  )
}
