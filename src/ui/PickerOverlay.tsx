import { useState, useEffect, useMemo, useCallback, useRef } from "react"
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
  renderItem: (
    item: T,
    helpers: {
      highlighted: boolean
      active: boolean
    },
  ) => ReactNode
  highlightedItem?: T | null
  activeItem?: T | null
  isNavigable?: (item: T) => boolean
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
  isNavigable,
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
    if (input) queueMicrotask(() => input.focus())
  }, [])

  const filtered = useMemo(
    () => items.filter((item) => filter(item, search)),
    [items, filter, search],
  )

  const navigableFiltered = useMemo(
    () =>
      isNavigable ? filtered.filter(isNavigable) : filtered,
    [filtered, isNavigable],
  )

  const currentHighlight = useMemo(() => {
    if (!highlightedItem) {
      return navigableFiltered[0] ?? null
    }
    const found = navigableFiltered.find(
      (item) => keyExtractor(item) === keyExtractor(highlightedItem),
    )
    return found ?? navigableFiltered[0] ?? null
  }, [navigableFiltered, highlightedItem, keyExtractor])

  const highlightRef = useRef<T | null>(currentHighlight)
  highlightRef.current = currentHighlight

  const prevHighlight = useRef(currentHighlight)
  useEffect(() => {
    if (currentHighlight && prevHighlight.current !== currentHighlight) {
      onHighlightChange?.(currentHighlight)
    }
    prevHighlight.current = currentHighlight
  }, [currentHighlight, onHighlightChange])

  const highlightIndex = useMemo(() => {
    if (!currentHighlight || navigableFiltered.length === 0) return -1
    return navigableFiltered.findIndex(
      (f) => keyExtractor(f) === keyExtractor(currentHighlight),
    )
  }, [navigableFiltered, currentHighlight, keyExtractor])

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
          if (navigableFiltered.length === 0 || highlightIndex < 0) return
          const nextPos =
            highlightIndex > 0
              ? highlightIndex - 1
              : navigableFiltered.length - 1
          highlightRef.current = navigableFiltered[nextPos]
          onHighlightChange?.(navigableFiltered[nextPos])
        } else if (name === "down") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          if (navigableFiltered.length === 0 || highlightIndex < 0) return
          const nextPos =
            highlightIndex < navigableFiltered.length - 1
              ? highlightIndex + 1
              : 0
          highlightRef.current = navigableFiltered[nextPos]
          onHighlightChange?.(navigableFiltered[nextPos])
        } else if (name === "return") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          if (highlightRef.current) onSelect(highlightRef.current)
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [
    visible,
    navigableFiltered,
    highlightIndex,
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
