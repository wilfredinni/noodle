import { useEffect, useMemo, useRef, useState, isValidElement } from "react"
import type { ReactNode } from "react"
import {
  MouseButton,
  TextAttributes,
  type ScrollBoxRenderable,
  type BoxRenderable,
} from "@opentui/core"
import { createPortal, useRenderer } from "@opentui/react"
import { useKeymap } from "@opentui/keymap/react"
import { useTheme, contrastOnPrimary } from "./theme"
import { lerpColor } from "./gradient"

let nextSelectId = 0

export interface SelectItem {
  id: string
  label: ReactNode
  description?: string
  disabled?: boolean
  color?: string
}

export interface SelectProps {
  items: SelectItem[]
  value?: string
  onChange?: (id: string) => void
  focused?: boolean
  visualFocused?: boolean
  placeholder?: string
  width?: number
  maxDropdownHeight?: number
  dropdownAlign?: "left" | "right"
  badge?: boolean
  onOpenChange?: (open: boolean) => void
  onActivate?: () => void
  triggerPriority?: number
}

export function Select({
  items,
  value,
  onChange,
  focused = false,
  visualFocused = focused,
  placeholder = "Select...",
  width,
  maxDropdownHeight = 16,
  dropdownAlign = "left",
  badge = false,
  onOpenChange,
  onActivate,
  triggerPriority = 50,
}: SelectProps) {
  const theme = useTheme()
  const keymap = useKeymap()
  const renderer = useRenderer()
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const triggerRef = useRef<BoxRenderable | null>(null)
  const [open, setOpen] = useState(false)
  const [uid] = useState(() => `s-${nextSelectId++}-`)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const contrastColor = useMemo(() => contrastOnPrimary(theme), [theme])

  const currentIndex = useMemo(
    () => items.findIndex((i) => i.id === value),
    [items, value],
  )
  const safeInitialIndex = currentIndex >= 0 ? currentIndex : 0

  useEffect(() => {
    if (!focused && open) setOpen(false)
  }, [focused, open])

  useEffect(() => {
    onOpenChange?.(open)
  }, [open, onOpenChange])

  useEffect(() => {
    if (open) {
      setHighlightIndex(safeInitialIndex)
    }
  }, [open, safeInitialIndex])

  useEffect(() => {
    if (open) {
      const idx = Math.min(highlightIndex, Math.max(0, items.length - 1))
      const id = items[idx]?.id
      if (id) scrollRef.current?.scrollChildIntoView(`${uid}${id}`)
    }
  }, [highlightIndex, open, items])

  useEffect(() => {
    if (open || !focused) return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const name = ctx.event.name
        if ((name === "return" && !ctx.event.ctrl) || name === "space") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          setOpen(true)
        }
      },
      { priority: triggerPriority },
    )
    return dispose
  }, [open, focused, keymap, triggerPriority])

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
          const idx = Math.min(highlightIndex, Math.max(0, items.length - 1))
          const item = items[idx]
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

  const selectedBadgeBg =
    badge && selectedItem?.color
      ? (theme as unknown as Record<string, string>)[selectedItem.color]
      : undefined

  const softBadgeBg = useMemo(() => {
    if (!selectedBadgeBg) return undefined
    try {
      return lerpColor(theme.backgroundElement, selectedBadgeBg, 0.3)
    } catch {
      return theme.borderSubtle
    }
  }, [theme.backgroundElement, selectedBadgeBg])

  const selectBg = selectedBadgeBg
    ? visualFocused
      ? softBadgeBg
      : selectedBadgeBg
    : open
      ? theme.primary
      : visualFocused || hovered
        ? theme.borderSubtle
        : theme.backgroundElement

  const labelColor = selectedBadgeBg
    ? visualFocused
      ? selectedBadgeBg
      : contrastColor
    : open
      ? contrastColor
      : theme.text

  const indicatorColor = selectedBadgeBg
    ? visualFocused
      ? selectedBadgeBg
      : contrastColor
    : selectedItem
      ? open
        ? contrastColor
        : theme.text
      : theme.textMuted

  const dropdownWidth = useMemo(() => {
    let maxLabel = 0
    for (const item of items) {
      const text = extractText(item.label)
      if (text) maxLabel = Math.max(maxLabel, text.length)
      if (item.description)
        maxLabel = Math.max(maxLabel, item.description.length)
    }
    return width !== undefined ? Math.max(width, maxLabel + 6) : maxLabel + 6
  }, [items, width])

  const dropdownMaxHeight = useMemo(
    () =>
      Math.min(
        maxDropdownHeight,
        items.reduce((s, i) => s + (i.description ? 2 : 1), 0),
      ),
    [maxDropdownHeight, items],
  )

  const selectedText = selectedItem
    ? badge && selectedBadgeBg
      ? extractText(selectedItem.label)
      : typeof selectedItem.label === "string"
        ? selectedItem.label
        : extractText(selectedItem.label)
    : placeholder

  const triggerWidth =
    width !== undefined ? width : badge ? selectedText.length + 4 : "100%"

  return (
    <box
      style={{
        flexDirection: "column",
        position: "relative",
        zIndex: open ? 100 : 0,
        flexShrink: 0,
        width: width !== undefined ? width : triggerWidth,
      }}
    >
      <box style={{ position: "relative", flexShrink: 0 }}>
        <box
          ref={triggerRef}
          height={1}
          onMouseDown={(event) => {
            if (event.button !== MouseButton.LEFT) return
            onActivate?.()
            setOpen(true)
          }}
          onMouseOver={() => setHovered(true)}
          onMouseOut={() => setHovered(false)}
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor: selectBg,
            flexShrink: 0,
            width: width !== undefined ? width : triggerWidth,
          }}
        >
          <box style={{ flexDirection: "row", flexGrow: 1, flexShrink: 0 }}>
            {selectedItem ? (
              renderLabel(
                badge && selectedBadgeBg
                  ? extractText(selectedItem.label)
                  : selectedItem.label,
                labelColor,
                focused && selectedBadgeBg ? TextAttributes.BOLD : undefined,
              )
            ) : (
              <text fg={theme.textMuted} style={{ flexShrink: 0 }}>
                {placeholder}
              </text>
            )}
          </box>
          <text fg={indicatorColor} style={{ flexShrink: 0 }}>
            {" "}
            ▼
          </text>
        </box>

        {open &&
          (() => {
            const renderList = (ref: typeof scrollRef) => (
              <scrollbox
                ref={ref}
                scrollY
                maxHeight={dropdownMaxHeight}
                scrollbarOptions={{ visible: false }}
              >
                <box style={{ flexDirection: "column" }}>
                  {items.map((item, i) => {
                    const isHighlighted = i === highlightIndex
                    const itemColor = item.color
                      ? ((theme as unknown as Record<string, string>)[
                          item.color
                        ] ?? theme.text)
                      : theme.text
                    return (
                      <box
                        key={item.id}
                        id={`${uid}${item.id}`}
                        opacity={item.disabled ? 0.4 : 1}
                        onMouseDown={(event) => {
                          if (
                            event.button !== MouseButton.LEFT ||
                            item.disabled
                          )
                            return
                          onChange?.(item.id)
                          setOpen(false)
                          event.preventDefault()
                          event.stopPropagation()
                        }}
                        onMouseOver={
                          item.disabled ? undefined : () => setHighlightIndex(i)
                        }
                        style={{
                          flexDirection: "row",
                          gap: 1,
                          paddingLeft: 1,
                          paddingRight: 1,
                          height: item.description ? 2 : 1,
                          backgroundColor: isHighlighted
                            ? theme.backgroundElement
                            : undefined,
                        }}
                      >
                        <box style={{ flexDirection: "column", flexGrow: 1 }}>
                          {renderLabel(
                            item.label,
                            item.id === value && !item.color
                              ? theme.primary
                              : itemColor,
                            isHighlighted ? TextAttributes.BOLD : undefined,
                          )}
                          {item.description && (
                            <text fg={theme.textMuted}>{item.description}</text>
                          )}
                        </box>
                        {item.id === value && !item.disabled && (
                          <text fg={theme.primary}>●</text>
                        )}
                      </box>
                    )
                  })}
                </box>
              </scrollbox>
            )

            const root = renderer?.root as unknown as
              { add: (...args: unknown[]) => void } | undefined
            if (root && triggerRef.current) {
              const x =
                dropdownAlign === "right"
                  ? triggerRef.current.x +
                    triggerRef.current.width -
                    dropdownWidth
                  : triggerRef.current.x
              return createPortal(
                <box
                  style={{
                    position: "absolute",
                    top: triggerRef.current.y + 1,
                    left: x,
                    width: dropdownWidth,
                    zIndex: 10000,
                    backgroundColor: theme.background,
                    borderStyle: "single",
                    borderColor: theme.primary,
                  }}
                >
                  {renderList(scrollRef)}
                </box>,
                root,
                null,
              )
            }
            return (
              <box
                style={{
                  position: "absolute",
                  ...(dropdownAlign === "right" ? { right: 0 } : { left: 0 }),
                  width: dropdownWidth,
                  zIndex: 10000,
                  backgroundColor: theme.background,
                  borderStyle: "single",
                  borderColor: theme.primary,
                }}
              >
                {renderList(scrollRef)}
              </box>
            )
          })()}
      </box>
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
      <text fg={fg} attributes={attributes} style={{ flexShrink: 0 }}>
        {label}
      </text>
    )
  }
  return label
}

function extractText(label: ReactNode): string {
  if (typeof label === "string") return label
  if (typeof label === "number") return String(label)
  if (isValidElement(label)) {
    const children = (label.props as { children?: ReactNode }).children
    if (typeof children === "string") return children
    if (typeof children === "number") return String(children)
    if (isValidElement(children)) return extractText(children)
    if (Array.isArray(children)) return children.map(extractText).join("")
  }
  return ""
}
