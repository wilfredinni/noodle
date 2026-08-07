import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import type { ReactNode } from "react"
import { MouseButton, type ScrollBoxRenderable } from "@opentui/core"
import { useKeymap } from "@opentui/keymap/react"
import { Overlay } from "./Overlay"
import { EscapeClose } from "./EscapeClose"
import { useTheme } from "../theme"

export interface PickerOverlayProps<T> {
  visible: boolean
  title: string
  width?: number
  placeholder?: string
  items: T[]
  keyExtractor: (item: T) => string
  filter: (item: T, query: string) => boolean
  sortItems?: (items: T[], query: string) => T[]
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
  firstAction?: {
    label: string
    shortcut?: string
    onSelect: () => void
  }
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
  sortItems,
  renderItem,
  highlightedItem,
  activeItem,
  isNavigable,
  firstAction,
  placeholder = "Search...",
  onHighlightChange,
  onSelect,
  onClose,
}: PickerOverlayProps<T>) {
  const theme = useTheme()
  const keymap = useKeymap()
  const [search, setSearch] = useState("")
  const [actionHighlighted, setActionHighlighted] = useState(false)
  const prevVisible = useRef(visible)
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const actionHighlightedRef = useRef(false)
  useEffect(() => {
    if (visible && !prevVisible.current) {
      setSearch("")
      setActionHighlighted(false)
      actionHighlightedRef.current = false
    }
    prevVisible.current = visible
  }, [visible])
  useEffect(() => {
    if (!firstAction) setActionHighlighted(false)
  }, [firstAction])
  const inputRef = useCallback((r: unknown) => {
    const input = r as { focus: () => void } | null
    if (input) queueMicrotask(() => input.focus())
  }, [])

  const filtered = useMemo(() => {
    const matches = items.filter((item) => filter(item, search))
    return sortItems ? sortItems(matches, search) : matches
  }, [items, filter, sortItems, search])

  const navigableFiltered = useMemo(
    () => (isNavigable ? filtered.filter(isNavigable) : filtered),
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

  const isActionHighlighted =
    firstAction !== undefined &&
    (actionHighlighted || navigableFiltered.length === 0)
  actionHighlightedRef.current = isActionHighlighted

  const highlightRef = useRef<T | null>(currentHighlight)
  highlightRef.current = currentHighlight

  const prevHighlight = useRef(currentHighlight)
  useEffect(() => {
    if (
      !isActionHighlighted &&
      currentHighlight &&
      prevHighlight.current !== currentHighlight
    ) {
      onHighlightChange?.(currentHighlight)
    }
    prevHighlight.current = currentHighlight
  }, [currentHighlight, isActionHighlighted, onHighlightChange])

  const highlightIndex = useMemo(() => {
    if (!currentHighlight || navigableFiltered.length === 0) return -1
    return navigableFiltered.findIndex(
      (f) => keyExtractor(f) === keyExtractor(currentHighlight),
    )
  }, [navigableFiltered, currentHighlight, keyExtractor])

  const moveHighlight = useCallback(
    (direction: -1 | 1) => {
      const targetCount = navigableFiltered.length + (firstAction ? 1 : 0)
      if (targetCount === 0) return
      const currentIndex = actionHighlightedRef.current
        ? navigableFiltered.length
        : highlightIndex
      if (currentIndex < 0) return
      const nextPos = (currentIndex + direction + targetCount) % targetCount
      if (firstAction && nextPos === navigableFiltered.length) {
        actionHighlightedRef.current = true
        setActionHighlighted(true)
        onHighlightChange?.(null)
        return
      }
      const nextItem = navigableFiltered[nextPos]
      actionHighlightedRef.current = false
      setActionHighlighted(false)
      highlightRef.current = nextItem
      onHighlightChange?.(nextItem)
    },
    [firstAction, highlightIndex, navigableFiltered, onHighlightChange],
  )

  useEffect(() => {
    if (!visible || !currentHighlight || isActionHighlighted) return

    const id = `picker-item-${keyExtractor(currentHighlight)}`
    const scrollIntoView = () => scrollRef.current?.scrollChildIntoView(id)
    scrollIntoView()

    // Portaled overlays receive their final layout on the following turn.
    // Repeat the scroll then so the initial highlighted item is visible.
    const timer = setTimeout(scrollIntoView, 0)
    return () => clearTimeout(timer)
  }, [visible, currentHighlight, isActionHighlighted, keyExtractor])

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
          moveHighlight(-1)
        } else if (name === "down") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          moveHighlight(1)
        } else if (name === "return") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          if (actionHighlightedRef.current) {
            firstAction?.onSelect()
          } else if (highlightRef.current) {
            onSelect(highlightRef.current)
          }
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [visible, moveHighlight, firstAction, onSelect, onClose, keymap])

  if (!visible) return null

  const results = (
    <scrollbox
      ref={scrollRef}
      scrollY
      paddingLeft={1}
      paddingRight={1}
      height={firstAction ? Math.max(1, Math.min(items.length, 13)) : undefined}
      maxHeight={firstAction ? 13 : 16}
      scrollbarOptions={{ visible: false }}
    >
      <box style={{ flexDirection: "column" }}>
        {filtered.map((item) => {
          const key = keyExtractor(item)
          const isHighlighted =
            !isActionHighlighted && currentHighlight === item
          const navigable = isNavigable?.(item) ?? true
          return (
            <box
              key={key}
              id={`picker-item-${key}`}
              onMouseDown={(event) => {
                if (event.button !== MouseButton.LEFT || !navigable) return
                onSelect(item)
                event.preventDefault()
                event.stopPropagation()
              }}
              onMouseOver={
                navigable
                  ? () => {
                      actionHighlightedRef.current = false
                      setActionHighlighted(false)
                      onHighlightChange?.(item)
                    }
                  : undefined
              }
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
          <box paddingLeft={3} paddingTop={firstAction ? 0 : 1}>
            <text fg={theme.textMuted}>No results found</text>
          </box>
        )}
      </box>
    </scrollbox>
  )

  const action = firstAction && (
    <box paddingLeft={1} paddingRight={1}>
      <box
        onMouseDown={(event) => {
          if (event.button !== MouseButton.LEFT) return
          firstAction.onSelect()
          event.preventDefault()
          event.stopPropagation()
        }}
        onMouseOver={() => {
          actionHighlightedRef.current = true
          setActionHighlighted(true)
          onHighlightChange?.(null)
        }}
        style={{
          flexDirection: "row",
          paddingLeft: 3,
          paddingRight: 3,
          gap: 1,
          backgroundColor: isActionHighlighted ? theme.primary : undefined,
        }}
      >
        <box width={1} />
        <text fg={isActionHighlighted ? "#1a1a1a" : theme.text}>
          {firstAction.label}
        </text>
        <box flexGrow={1} />
        {firstAction.shortcut && (
          <text fg={isActionHighlighted ? "#1a1a1a" : theme.textMuted}>
            {firstAction.shortcut}
          </text>
        )}
      </box>
    </box>
  )

  return (
    <Overlay visible width={width} gap={1} padding={1}>
      <box paddingLeft={4} paddingRight={4}>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme.text}>{title}</text>
          <EscapeClose onClose={onClose} />
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
      {firstAction ? (
        <box id="picker-first-action-layout" flexDirection="column" height={15}>
          {action}
          {results}
        </box>
      ) : (
        results
      )}
    </Overlay>
  )
}
