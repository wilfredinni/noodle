import { useEffect, useMemo, useRef, useState } from "react"
import {
  BoxRenderable,
  CliRenderEvents,
  MouseButton,
  ScrollBoxRenderable,
} from "@opentui/core"
import {
  createPortal,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react"
import { useTheme } from "./theme"
import { highlightMatches } from "./highlightMatches"
import { registerCompletion } from "./variable-completion/variableCompletionInterceptor"

interface AutocompleteItem {
  key: string
  label: string
  matchQuery?: string
  description?: string
  signature?: string
  example?: string
}

interface AutocompleteEditor {
  screenX: number
  screenY: number
  visualCursor: { visualCol: number; visualRow: number }
  focused: boolean
  isDestroyed: boolean
}

export function Autocomplete({
  id,
  compactDetails = false,
  items,
  query,
  value,
  getEditor,
  message,
  onSelect,
  onDismiss,
}: {
  id: string
  compactDetails?: boolean
  items: readonly AutocompleteItem[]
  query: string
  value: string
  getEditor: () => AutocompleteEditor | null
  message?: string
  onSelect: (index: number, trigger: "tab" | "return" | "mouse") => boolean
  onDismiss: () => void
}) {
  const renderer = useRenderer()
  const { width: terminalWidth, height: terminalHeight } =
    useTerminalDimensions()
  const theme = useTheme()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [top, setTop] = useState(0)
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const popupRef = useRef<BoxRenderable | null>(null)
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const anchorReadyRef = useRef(getEditor() !== null)
  const index = Math.max(0, Math.min(selectedIndex, items.length - 1))
  const selected = items[index]
  const details = [
    selected?.description,
    selected?.signature,
    selected?.example ? `Example: ${selected.example}` : undefined,
  ]
    .filter((line): line is string => !!line)
    .join("\n")
  const hasDetails = details.length > 0 && terminalHeight >= 8
  const maxVisibleCount = Math.max(
    0,
    Math.min(10, terminalHeight - 2, Math.max(message ? 1 : 0, items.length)),
  )
  const labelWidth = useMemo(() => {
    let width = 0
    for (const item of items) {
      width = Math.max(width, Bun.stringWidth(item.label))
      if (width >= terminalWidth) return terminalWidth
    }
    return width
  }, [items, terminalWidth])
  const menuWidth = Math.min(
    terminalWidth,
    Math.max(
      18,
      hasDetails ? 64 : 0,
      labelWidth + 4 + (items.length > maxVisibleCount ? 1 : 0),
      Bun.stringWidth(message ?? "") + 4,
    ),
  )
  const detailRows = details
    .split("\n")
    .reduce(
      (sum, line) =>
        sum +
        Math.max(
          1,
          Math.ceil(Bun.stringWidth(line) / Math.max(1, menuWidth - 4)),
        ),
      0,
    )
  const detailHeight = hasDetails
    ? Math.min(compactDetails ? 1 : 6, detailRows, terminalHeight - 6) + 1
    : 0
  const visibleCount = Math.max(
    0,
    Math.min(maxVisibleCount, terminalHeight - 2 - detailHeight),
  )
  const menuHeight = visibleCount + detailHeight + 2
  const start = Math.max(
    0,
    Math.min(Math.floor(top) - 3, items.length - visibleCount),
  )
  const end = Math.min(items.length, start + visibleCount + 6)
  const mounted = anchor !== null && visibleCount > 0

  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    const change = ({ position }: { position: number }) => setTop(position)
    setTop(scroll.scrollTop)
    scroll.verticalScrollBar.on("change", change)
    return () => {
      scroll.verticalScrollBar.off("change", change)
    }
  }, [mounted])

  useEffect(() => {
    setSelectedIndex(0)
    setTop(0)
    scrollRef.current?.scrollTo(0)
  }, [id, query, value])

  useEffect(() => {
    setSelectedIndex((current) =>
      Math.max(0, Math.min(current, items.length - 1)),
    )
  }, [items.length])

  useEffect(() => {
    if (visibleCount === 0) return
    return registerCompletion((key) => {
      const editor = getEditor()
      if (!editor?.focused || editor.isDestroyed || key.defaultPrevented)
        return false
      if (
        key.ctrl ||
        key.meta ||
        key.option ||
        key.super ||
        key.hyper ||
        (key.name === "tab" && key.shift)
      )
        return false
      if (key.name === "escape") {
        onDismiss()
        return true
      }
      if (key.name === "up" || key.name === "down") {
        if (items.length) {
          setSelectedIndex(
            (current) =>
              (Math.min(current, items.length - 1) +
                (key.name === "up" ? -1 : 1) +
                items.length) %
              items.length,
          )
        }
        return true
      }
      if ((key.name === "tab" || key.name === "return") && items.length) {
        return onSelect(index, key.name)
      }
      return false
    })
  }, [getEditor, index, items.length, onDismiss, onSelect, visibleCount])

  useEffect(() => {
    const revealSelection = () => {
      const scroll = scrollRef.current
      if (!scroll) return
      const row = index + (message ? 1 : 0)
      if (row < scroll.scrollTop) scroll.scrollTo(row)
      else if (row >= scroll.scrollTop + visibleCount)
        scroll.scrollTo(row - visibleCount + 1)
    }
    revealSelection()
    renderer.once(CliRenderEvents.FRAME, revealSelection)
    return () => {
      renderer.off(CliRenderEvents.FRAME, revealSelection)
    }
  }, [index, items.length, message, mounted, renderer, visibleCount])

  useEffect(() => {
    const readAnchor = () => {
      const editor = getEditor()
      if (!editor || editor.isDestroyed) return null
      const cursor = editor.visualCursor
      return {
        x: Math.max(
          0,
          Math.min(
            editor.screenX + cursor.visualCol,
            terminalWidth - menuWidth,
          ),
        ),
        y: Math.max(
          0,
          Math.min(
            editor.screenY + cursor.visualRow + 1,
            terminalHeight - menuHeight,
          ),
        ),
      }
    }
    const next = readAnchor()
    setAnchor((current) =>
      current?.x === next?.x && current?.y === next?.y ? current : next,
    )
    const revealAfterAnchor = () => {
      if (popupRef.current) popupRef.current.visible = true
    }
    const syncAfterLayout = () => {
      const next = readAnchor()
      const popup = popupRef.current
      if (!next || !popup) return
      popup.left = next.x
      popup.top = next.y
      if (!anchorReadyRef.current) {
        anchorReadyRef.current = true
        renderer.once(CliRenderEvents.FRAME, revealAfterAnchor)
      }
    }
    renderer.once(CliRenderEvents.FRAME, syncAfterLayout)
    return () => {
      renderer.off(CliRenderEvents.FRAME, syncAfterLayout)
      renderer.off(CliRenderEvents.FRAME, revealAfterAnchor)
    }
  }, [
    getEditor,
    menuHeight,
    menuWidth,
    renderer,
    terminalHeight,
    terminalWidth,
    value,
  ])

  if (!anchor || visibleCount === 0) return null

  return createPortal(
    <box
      id={id}
      ref={popupRef}
      visible={anchorReadyRef.current}
      position="absolute"
      top={anchor.y}
      left={anchor.x}
      width={menuWidth}
      height={menuHeight}
      zIndex={10000}
      flexDirection="column"
      flexShrink={0}
      backgroundColor={theme.backgroundPanel}
      paddingX={1}
      borderStyle="single"
      borderColor={theme.borderActive}
      onMouseDown={(event) => event.stopPropagation()}
      onMouseScroll={(event) => event.stopPropagation()}
    >
      <scrollbox
        id={`${id}-scroll`}
        ref={scrollRef}
        height={visibleCount}
        scrollX={false}
        scrollY
        focusable={false}
        contentOptions={{ width: "100%" }}
        horizontalScrollbarOptions={{ visible: false }}
        verticalScrollbarOptions={{
          trackOptions: {
            backgroundColor: theme.background,
            foregroundColor: theme.borderActive,
          },
        }}
      >
        {message ? (
          <text fg={theme.textMuted} wrapMode="none">
            {message}
          </text>
        ) : null}
        <box height={items.length} width="100%" flexShrink={0}>
          {items.slice(start, end).map((item, offset) => {
            const itemIndex = start + offset
            return (
              <box
                key={item.key}
                id={`${id}-item-${itemIndex}`}
                height={1}
                position="absolute"
                top={itemIndex}
                left={0}
                flexShrink={0}
                width="100%"
                backgroundColor={
                  itemIndex === index ? theme.backgroundElement : undefined
                }
                onMouseOver={() => setSelectedIndex(itemIndex)}
                onMouseDown={(event) => {
                  if (
                    event.button !== MouseButton.LEFT ||
                    !onSelect(itemIndex, "mouse")
                  )
                    return
                  event.preventDefault()
                  event.stopPropagation()
                }}
              >
                <text
                  fg={itemIndex === index ? theme.primary : theme.text}
                  wrapMode="none"
                >
                  {highlightMatches(
                    item.label,
                    item.matchQuery ?? query,
                    theme.primary,
                  )}
                </text>
              </box>
            )
          })}
        </box>
      </scrollbox>
      {detailHeight > 0 ? (
        <box
          id={`${id}-details`}
          height={detailHeight}
          flexShrink={0}
          border={["top"]}
          borderColor={theme.border}
          overflow="hidden"
        >
          <text fg={theme.textMuted} wrapMode="char">
            <span fg={theme.secondary}>{selected?.description ?? ""}</span>
            {details.slice(selected?.description?.length ?? 0)}
          </text>
        </box>
      ) : null}
    </box>,
    renderer.root,
    null,
  )
}
