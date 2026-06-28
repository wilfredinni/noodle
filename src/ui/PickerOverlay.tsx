import { useEffect, useRef, useState } from "react"
import { useKeymap } from "@opentui/keymap/react"
import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { useTheme } from "./theme"
import { Overlay } from "./Overlay"

export interface PickerItem {
  id: string | number
  label: string
  value?: unknown
  indicator?: string
  indicatorColor?: string
}

export function PickerOverlay({
  visible,
  title,
  items,
  activeId,
  width = 30,
  onSelect,
  onClose,
}: {
  visible: boolean
  title: string
  items: PickerItem[]
  activeId?: string | number
  width?: number
  onSelect: (item: PickerItem) => void
  onClose: () => void
}) {
  const theme = useTheme()
  const keymap = useKeymap()
  const initialIndex = items.findIndex((it) => it.id === activeId)
  const safeIndex = initialIndex >= 0 ? initialIndex : 0
  const [previewIndex, setPreviewIndex] = useState(safeIndex)
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)

  useEffect(() => {
    setPreviewIndex(safeIndex)
  }, [safeIndex, visible])

  useEffect(() => {
    scrollRef.current?.scrollChildIntoView(`picker-${previewIndex}`)
  }, [previewIndex])

  useEffect(() => {
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const name = ctx.event.name
        if (name === "escape") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          onClose()
        } else if (name === "up") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          setPreviewIndex((p) => Math.max(0, p - 1))
        } else if (name === "down") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          setPreviewIndex((p) => Math.min(items.length - 1, p + 1))
        } else if (name === "return") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          const item = items[previewIndex]
          if (item !== undefined) onSelect(item)
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [items, previewIndex, onSelect, onClose, keymap])

  const activeIndex = items.findIndex((it) => it.id === activeId)

  return (
    <Overlay visible={visible} width={width} gap={1} padding={1}>
      <box paddingLeft={1} paddingRight={1}>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme.text}>{title}</text>
          <text fg={theme.textMuted}>esc</text>
        </box>
      </box>
      <scrollbox
        ref={scrollRef}
        scrollY
        paddingLeft={1}
        paddingRight={1}
        maxHeight={16}
        scrollbarOptions={{ visible: false }}
      >
        <box style={{ flexDirection: "column" }}>
          {items.map((item, i) => {
            const isActive = i === activeIndex
            const isSelected = i === previewIndex
            const indicator = item.indicator ?? "●"
            const indicatorFg = item.indicatorColor ?? (isActive ? theme.primary : theme.textMuted)
            return (
              <box
                key={i}
                id={`picker-${i}`}
                style={{
                  flexDirection: "row",
                  height: 1,
                  paddingLeft: 1,
                  paddingRight: 3,
                  gap: 1,
                  backgroundColor: isSelected ? theme.primary : undefined,
                }}
              >
                <text fg={indicatorFg}>{indicator}</text>
                <text
                  fg={
                    isSelected
                      ? "#1a1a1a"
                      : isActive
                        ? theme.primary
                        : theme.text
                  }
                  attributes={isSelected ? TextAttributes.BOLD : undefined}
                >
                  {item.label}
                </text>
              </box>
            )
          })}
        </box>
      </scrollbox>
    </Overlay>
  )
}
