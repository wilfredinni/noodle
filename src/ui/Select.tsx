import { useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { useKeymap } from "@opentui/keymap/react"
import { useTheme } from "./theme"

export interface SelectItem {
  id: string
  label: ReactNode
  description?: string
  disabled?: boolean
}

export interface SelectProps {
  items: SelectItem[]
  value?: string
  onChange?: (id: string) => void
  focused?: boolean
  placeholder?: string
  width?: number
  maxDropdownHeight?: number
  onOpenChange?: (open: boolean) => void
}

export function Select({
  items,
  value,
  onChange,
  focused = false,
  placeholder = "Select...",
  width = 30,
  maxDropdownHeight = 16,
  onOpenChange,
}: SelectProps) {
  const theme = useTheme()
  const keymap = useKeymap()
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)

  const currentIndex = useMemo(
    () => items.findIndex((i) => i.id === value),
    [items, value],
  )
  const safeInitialIndex = currentIndex >= 0 ? currentIndex : 0

  useEffect(() => {
    if (!focused && open) setOpen(false)
  }, [focused])

  useEffect(() => {
    onOpenChange?.(open)
  }, [open])

  useEffect(() => {
    if (open) {
      setHighlightIndex(safeInitialIndex)
    }
  }, [open])

  useEffect(() => {
    if (highlightIndex >= items.length) {
      setHighlightIndex(Math.max(0, items.length - 1))
    }
  }, [items.length])

  useEffect(() => {
    if (open) {
      const id = items[highlightIndex]?.id
      if (id) scrollRef.current?.scrollChildIntoView(`select-item-${id}`)
    }
  }, [highlightIndex, open, items])

  useEffect(() => {
    if (open || !focused) return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const name = ctx.event.name
        if (name === "return" || name === "space") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          setOpen(true)
        }
      },
      { priority: 50 },
    )
    return dispose
  }, [open, focused, keymap])

  useEffect(() => {
    if (!open) return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const name = ctx.event.name
        if (name === "escape") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          setOpen(false)
        } else if (name === "up") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          setHighlightIndex((i) => {
            for (let j = i - 1; j >= 0; j--) {
              if (!items[j]?.disabled) return j
            }
            return i
          })
        } else if (name === "down") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          setHighlightIndex((i) => {
            for (let j = i + 1; j < items.length; j++) {
              if (!items[j]?.disabled) return j
            }
            return i
          })
        } else if (name === "return") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          const item = items[highlightIndex]
          if (item && !item.disabled) {
            onChange?.(item.id)
            setOpen(false)
          }
        }
      },
      { priority: 110 },
    )
    return dispose
  }, [open, highlightIndex, items, onChange, keymap])

  const selectedItem = items.find((i) => i.id === value)

  return (
    <box style={{ position: "relative", width, flexDirection: "column" }}>
      <box
        height={1}
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingLeft: 1,
          paddingRight: 1,
          backgroundColor: open
            ? theme.primary
            : focused
              ? theme.borderSubtle
              : theme.backgroundElement,
        }}
      >
        <box style={{ flexDirection: "row", flexGrow: 1 }}>
          {selectedItem ? (
            renderLabel(selectedItem.label, open ? "#1a1a1a" : theme.text)
          ) : (
            <text fg={theme.textMuted}>{placeholder}</text>
          )}
        </box>
        <text fg={theme.textMuted}> ▼</text>
      </box>

      {open && (
        <box
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            width: "100%",
            zIndex: 10000,
            backgroundColor: theme.background,
            borderStyle: "single",
            borderColor: theme.primary,
          }}
        >
          <scrollbox
            ref={scrollRef}
            scrollY
            maxHeight={maxDropdownHeight}
            scrollbarOptions={{ visible: false }}
          >
            <box style={{ flexDirection: "column" }}>
              {items.map((item, i) => {
                const isHighlighted = i === highlightIndex
                return (
                  <box
                    key={item.id}
                    id={`select-item-${item.id}`}
                    opacity={item.disabled ? 0.4 : 1}
                    style={{
                      flexDirection: "row",
                      paddingLeft: 1,
                      paddingRight: 1,
                      height: item.description ? 2 : 1,
                      backgroundColor: isHighlighted
                        ? theme.primary
                        : undefined,
                    }}
                  >
                    <box style={{ flexDirection: "column", flexGrow: 1 }}>
                      {renderLabel(
                        item.label,
                        isHighlighted
                          ? "#1a1a1a"
                          : item.id === value
                            ? theme.primary
                            : theme.text,
                        isHighlighted ? TextAttributes.BOLD : undefined,
                      )}
                      {item.description && (
                        <text fg={isHighlighted ? "#333" : theme.textMuted}>
                          {item.description}
                        </text>
                      )}
                    </box>
                    {item.id === value && !item.disabled && (
                      <text fg={isHighlighted ? "#1a1a1a" : theme.primary}>
                        {" "}
                        ●
                      </text>
                    )}
                  </box>
                )
              })}
            </box>
          </scrollbox>
        </box>
      )}
    </box>
  )
}

function renderLabel(
  label: ReactNode,
  fg: string,
  attributes?: number,
): ReactNode {
  if (typeof label === "string") {
    return (
      <text fg={fg} attributes={attributes}>
        {label}
      </text>
    )
  }
  return label
}
