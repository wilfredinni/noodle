import { getHelpSections } from "../helpTexts"
import { useTheme } from "../theme"
import { Overlay } from "./Overlay"
import type { Keybinds } from "../keybind"
import { TextAttributes } from "@opentui/core"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useRef } from "react"
import { useKeymap } from "@opentui/keymap/react"

const keyColumnWidth = 16

export function HelpOverlay({
  visible,
  keybinds,
}: {
  visible: boolean
  keybinds: Keybinds
}) {
  const theme = useTheme()
  const keymap = useKeymap()
  const sections = getHelpSections(keybinds)
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)

  useEffect(() => {
    if (!visible) return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const key = ctx.event
        if (key.name === "up" || (key.name === "k" && !key.ctrl)) {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          scrollRef.current?.scrollBy(-1 / 5, "viewport")
        } else if (key.name === "down" || (key.name === "j" && !key.ctrl)) {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          scrollRef.current?.scrollBy(1 / 5, "viewport")
        } else if (key.name === "pageup") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          scrollRef.current?.scrollBy(-1 / 2, "viewport")
        } else if (key.name === "pagedown") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          scrollRef.current?.scrollBy(1 / 2, "viewport")
        } else if (key.name === "home") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          scrollRef.current?.scrollTo(0)
        } else if (key.name === "end") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          const maxScroll = Math.max(
            0,
            (scrollRef.current?.scrollHeight ?? 0) -
              (scrollRef.current?.height ?? 0),
          )
          scrollRef.current?.scrollTo(maxScroll)
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [visible, keymap])

  return (
    <Overlay visible={visible} width={60} gap={1} padding={1}>
      <box
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingLeft: 4,
          paddingRight: 4,
        }}
      >
        <text fg={theme.text}>Keybindings</text>
        <text fg={theme.textMuted}>esc</text>
      </box>
      <scrollbox
        ref={scrollRef}
        scrollY
        focused={visible}
        maxHeight={20}
        style={{ flexGrow: 1 }}
        verticalScrollbarOptions={{
          trackOptions: {
            backgroundColor: theme.background,
            foregroundColor: theme.borderActive,
          },
        }}
      >
        <box style={{ flexDirection: "column", gap: 1 }}>
          {sections.map((section) => (
            <box key={section.title} style={{ flexDirection: "column" }}>
              <box paddingLeft={4} paddingRight={4}>
                <text fg={theme.text} attributes={TextAttributes.BOLD}>
                  {section.title}
                </text>
              </box>
              {section.keys.map((k, i) => (
                <box
                  key={i}
                  paddingLeft={4}
                  paddingRight={4}
                  style={{ flexDirection: "row" }}
                >
                  <text fg={theme.text}>{k.key.padEnd(keyColumnWidth)}</text>
                  <text fg={theme.textMuted}>{k.description}</text>
                </box>
              ))}
            </box>
          ))}
        </box>
      </scrollbox>
    </Overlay>
  )
}
