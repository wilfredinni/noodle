import type { ScrollBoxRenderable } from "@opentui/core"
import { useKeymap } from "@opentui/keymap/react"
import { useTerminalDimensions } from "@opentui/react"
import { useEffect, useRef } from "react"
import { useTheme } from "../theme"
import { Overlay } from "./Overlay"
import { EscapeClose } from "./EscapeClose"

export function NotificationOverlay({
  message,
  onClose,
}: {
  message: string
  onClose: () => void
}) {
  const theme = useTheme()
  const keymap = useKeymap()
  const { width, height } = useTerminalDimensions()
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)

  useEffect(
    () =>
      keymap.intercept(
        "key",
        ({ event }) => {
          const scroll = scrollRef.current
          switch (event.name) {
            case "escape":
              onClose()
              break
            case "up":
              scroll?.scrollBy(-1)
              break
            case "down":
              scroll?.scrollBy(1)
              break
            case "pageup":
              scroll?.scrollBy(-1, "viewport")
              break
            case "pagedown":
              scroll?.scrollBy(1, "viewport")
              break
            case "home":
              scroll?.scrollTo(0)
              break
            case "end":
              scroll?.scrollTo(scroll.scrollHeight)
              break
            default:
              return
          }
          event.preventDefault()
          event.stopPropagation()
        },
        { priority: 100 },
      ),
    [keymap, onClose],
  )

  return (
    <Overlay
      visible
      width={Math.min(76, width)}
      height={Math.min(24, height)}
      padding={width <= 10 ? 0 : 1}
      onClose={onClose}
    >
      <box flexDirection="row" justifyContent="space-between" flexShrink={0}>
        {width >= 20 && <text fg={theme.text}>Notification</text>}
        <EscapeClose onClose={onClose} />
      </box>
      <scrollbox
        id="notification-details"
        ref={scrollRef}
        focused
        flexGrow={1}
        minHeight={1}
        verticalScrollbarOptions={{
          trackOptions: {
            backgroundColor: theme.backgroundPanel,
            foregroundColor: theme.primary,
          },
        }}
        horizontalScrollbarOptions={{ visible: false }}
      >
        <text fg={theme.text}>{message}</text>
      </scrollbox>
      <text fg={theme.textMuted} flexShrink={0} wrapMode="none">
        {width >= 40 ? "↑↓ scroll · PgUp/PgDn · Home/End" : "↑↓ scroll"}
      </text>
    </Overlay>
  )
}
