import type { ScrollBoxRenderable } from "@opentui/core"
import { useKeymap } from "@opentui/keymap/react"
import { useTerminalDimensions } from "@opentui/react"
import { useEffect, useRef } from "react"
import { stringWidth } from "bun"
import type { ScriptPhase } from "../../preRequestScript"
import { useTheme } from "../theme"
import { EscapeClose } from "./EscapeClose"
import { Overlay } from "./Overlay"

export interface ScriptOrder {
  phase: ScriptPhase
  entries: { label: string; detail: string; current: boolean }[]
}

export function ScriptOrderOverlay({
  order,
  onClose,
}: {
  order: ScriptOrder
  onClose: () => void
}) {
  const theme = useTheme()
  const keymap = useKeymap()
  const { width, height } = useTerminalDimensions()
  const scroll = useRef<ScrollBoxRenderable | null>(null)
  const inset = width < 60 ? 0 : 4
  const description =
    order.phase === "pre"
      ? "Scripts run in this order before sending the request."
      : order.phase === "post"
        ? "Scripts run in this order after the response and captures."
        : "Tests run in this order after declarative assertions."
  const numberWidth = String(order.entries.length).length + 2
  const contentWidth = Math.max(
    stringWidth(description),
    ...order.entries.map(
      ({ label, detail }) =>
        numberWidth + stringWidth(label) + 2 + stringWidth(detail),
    ),
  )

  useEffect(
    () =>
      keymap.intercept(
        "key",
        ({ event }) => {
          switch (event.name) {
            case "escape":
              onClose()
              break
            case "up":
              scroll.current?.scrollBy(-1)
              break
            case "down":
              scroll.current?.scrollBy(1)
              break
            case "pageup":
              scroll.current?.scrollBy(-1, "viewport")
              break
            case "pagedown":
              scroll.current?.scrollBy(1, "viewport")
              break
            case "home":
              scroll.current?.scrollTo(0)
              break
            case "end":
              scroll.current?.scrollTo(scroll.current.scrollHeight)
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
      width={Math.min(width, Math.max(60, contentWidth + 3 + inset * 2))}
      height={Math.min(height, order.entries.length + 6)}
      padding={width <= 10 ? 0 : 1}
      gap={1}
      onClose={onClose}
    >
      <box
        flexDirection="row"
        justifyContent="space-between"
        flexShrink={0}
        paddingLeft={inset}
        paddingRight={inset}
      >
        <text fg={theme.text} minWidth={0} wrapMode="none" truncate>
          {width < 25 ? "Order" : "Execution order"}
        </text>
        <EscapeClose onClose={onClose} />
      </box>
      <scrollbox
        id="script-order-details"
        ref={scroll}
        focused
        scrollY
        flexGrow={1}
        minHeight={0}
        contentOptions={{ paddingLeft: inset, paddingRight: inset }}
        horizontalScrollbarOptions={{ visible: false }}
        verticalScrollbarOptions={{
          trackOptions: {
            backgroundColor: theme.backgroundPanel,
            foregroundColor: theme.borderActive,
          },
        }}
      >
        <text fg={theme.textMuted} marginBottom={1} wrapMode="none" truncate>
          {description}
        </text>
        {order.entries.map((entry, index) => (
          <box
            id={`script-reference-${index}`}
            key={index}
            flexDirection="row"
            flexShrink={0}
            height={1}
            overflow="hidden"
          >
            <text
              fg={entry.current ? theme.primary : theme.textMuted}
              width={numberWidth}
              flexShrink={0}
            >
              {index + 1}
            </text>
            <box flexDirection="row" flexGrow={1} minWidth={0} gap={2}>
              <text
                fg={entry.current ? theme.primary : theme.text}
                flexGrow={1}
                minWidth={0}
                wrapMode="none"
                truncate
              >
                {entry.label}
              </text>
              <text fg={theme.textMuted} minWidth={6} wrapMode="none" truncate>
                {entry.detail}
              </text>
            </box>
          </box>
        ))}
      </scrollbox>
    </Overlay>
  )
}
