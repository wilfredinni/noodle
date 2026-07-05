import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react"
import type { ReactNode } from "react"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useKeymap } from "@opentui/keymap/react"
import { Overlay } from "./Overlay"
import { useTheme } from "./theme"

export interface PickerOverlayProps<T> {
  visible: boolean
  title: string
  width?: number
  placeholder?: string
  items: T[]
  keyExtractor: (item: T) => string
  filter: (item: T, query: string) => boolean
  renderItem: (item: T, helpers: {
    highlighted: boolean
    active: boolean
  }) => ReactNode
  highlightedItem?: T | null
  activeItem?: T | null
  onHighlightChange?: (item: T | null) => void
  onSelect: (item: T) => void
  onClose: () => void
}

export function PickerOverlay<T>({
  visible,
  title,
  width = 48,
  items,
  keyExtractor,
  filter,
  renderItem,
  highlightedItem,
  activeItem,
  placeholder = "Search...",
  onHighlightChange,
  onSelect,
  onClose,
}: PickerOverlayProps<T>) {
  const theme = useTheme()
  const keymap = useKeymap()
  const [search, setSearch] = useState("")
  const prevVisible = useRef(visible)
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  useEffect(() => {
    if (visible && !prevVisible.current) {
      setSearch("")
    }
    prevVisible.current = visible
  }, [visible])
  const inputRef = useCallback((r: unknown) => {
    const input = r as { focus: () => void } | null
    if (input) setTimeout(() => input.focus(), 1)
  }, [])

  const filtered = useMemo(
    () => items.filter((item) => filter(item, search)),
    [items, filter, search],
  )

  const currentHighlight = useMemo(() => {
    if (!highlightedItem) {
      return filtered[0] ?? null
    }
    const found = filtered.find(
      (item) => keyExtractor(item) === keyExtractor(highlightedItem),
    )
    return found ?? filtered[0] ?? null
  }, [filtered, highlightedItem, keyExtractor])

  useEffect(() => {
    if (currentHighlight) {
      const id = `picker-item-${keyExtractor(currentHighlight)}`
      scrollRef.current?.scrollChildIntoView(id)
    }
  }, [currentHighlight, keyExtractor])

  useEffect(() => {
    if (!visible) return
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
          if (filtered.length === 0) return
          const pos = currentHighlight
            ? filtered.findIndex(
                (f) => keyExtractor(f) === keyExtractor(currentHighlight),
              )
            : -1
          const nextPos = pos > 0 ? pos - 1 : filtered.length - 1
          onHighlightChange?.(filtered[nextPos])
        } else if (name === "down") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          if (filtered.length === 0) return
          const pos = currentHighlight
            ? filtered.findIndex(
                (f) => keyExtractor(f) === keyExtractor(currentHighlight),
              )
            : -1
          const nextPos = pos < filtered.length - 1 ? pos + 1 : 0
          onHighlightChange?.(filtered[nextPos])
        } else if (name === "return") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          if (currentHighlight) onSelect(currentHighlight)
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [
    visible,
    filtered,
    currentHighlight,
    onHighlightChange,
    onSelect,
    onClose,
    keymap,
    keyExtractor,
  ])

  if (!visible) return null

  return (
    <Overlay visible width={width} gap={1} padding={1}>
      <box paddingLeft={4} paddingRight={4}>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme.text}>{title}</text>
          <text fg={theme.textMuted}>esc</text>
        </box>
        <box paddingTop={1}>
          <input
            ref={inputRef}
            value={search}
            onInput={(e: string) => setSearch(e)}
            placeholder={placeholder}
            placeholderColor={theme.textMuted}
            focusedBackgroundColor={theme.backgroundPanel}
            cursorColor={theme.primary}
            focusedTextColor={theme.textMuted}
          />
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
          {filtered.map((item) => {
            const key = keyExtractor(item)
            const isHighlighted = currentHighlight === item
            return (
              <box
                key={key}
                id={`picker-item-${key}`}
                style={{
                  flexDirection: "row",
                  paddingLeft: 3,
                  paddingRight: 3,
                  gap: 1,
                  backgroundColor: isHighlighted ? theme.primary : undefined,
                }}
              >
                {renderItem(item, {
                  highlighted: isHighlighted,
                  active: activeItem === item,
                })}
              </box>
            )
          })}
          {filtered.length === 0 && (
            <box paddingLeft={3} paddingTop={1}>
              <text fg={theme.textMuted}>No results found</text>
            </box>
          )}
        </box>
      </scrollbox>
    </Overlay>
  )
}
