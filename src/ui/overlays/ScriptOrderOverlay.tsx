import type { ScrollBoxRenderable } from "@opentui/core"
import { useKeymap } from "@opentui/keymap/react"
import { useTerminalDimensions } from "@opentui/react"
import { useEffect, useRef } from "react"
import type { ScriptPhase } from "../../preRequestScript"
import { FullBorder } from "../borders"
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
  const narrow = width < 60

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
      width={Math.min(80, width)}
      height={Math.min(height, 24, order.entries.length * (narrow ? 3 : 1) + 8)}
      onClose={onClose}
    >
      <box
        border={[...FullBorder.border]}
        customBorderChars={FullBorder.customBorderChars}
        borderColor={theme.primary}
        flexDirection="column"
        flexGrow={1}
        minHeight={0}
        padding={width < 20 ? 0 : 1}
        gap={1}
      >
        <box flexDirection="row" justifyContent="space-between" flexShrink={0}>
          <text fg={theme.primary}>
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
          horizontalScrollbarOptions={{ visible: false }}
          verticalScrollbarOptions={{
            trackOptions: {
              backgroundColor: theme.backgroundPanel,
              foregroundColor: theme.primary,
            },
          }}
        >
          <text fg={theme.textMuted} marginBottom={1} wrapMode="word">
            {order.phase === "pre"
              ? "Scripts run in this order before sending the request."
              : order.phase === "post"
                ? "Scripts run in this order after the response and captures."
                : "Tests run in this order after declarative assertions."}
          </text>
          {order.entries.map((entry, index) => (
            <box
              id={`script-reference-${index}`}
              key={index}
              flexDirection="row"
              flexShrink={0}
              marginBottom={narrow ? 1 : 0}
            >
              <text
                fg={entry.current ? theme.primary : theme.textMuted}
                width={String(order.entries.length).length + 2}
                flexShrink={0}
              >
                {index + 1}
              </text>
              <box
                flexDirection={narrow ? "column" : "row"}
                flexGrow={1}
                minWidth={0}
                gap={narrow ? 0 : 2}
              >
                <text
                  fg={entry.current ? theme.primary : theme.text}
                  width={narrow ? "100%" : "42%"}
                  flexShrink={0}
                  wrapMode="char"
                >
                  {entry.label}
                </text>
                <text fg={theme.textMuted} flexGrow={1} wrapMode="char">
                  {entry.detail}
                </text>
              </box>
            </box>
          ))}
        </scrollbox>
      </box>
    </Overlay>
  )
}
