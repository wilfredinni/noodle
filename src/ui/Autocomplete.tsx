import { useEffect, useRef, useState } from "react"
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
  items,
  query,
  value,
  getEditor,
  message,
  onSelect,
  onDismiss,
}: {
  id: string
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
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const popupRef = useRef<BoxRenderable | null>(null)
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const anchorReadyRef = useRef(getEditor() !== null)
  const visibleCount = Math.max(
    0,
    Math.min(10, terminalHeight - 2, Math.max(message ? 1 : 0, items.length)),
  )
  const menuHeight = visibleCount + 2
  const menuWidth = Math.min(
    terminalWidth,
    Math.max(
      18,
      items.reduce(
        (width, item) => Math.max(width, Bun.stringWidth(item.label)),
        0,
      ) +
        4 +
        (items.length > visibleCount ? 1 : 0),
      Bun.stringWidth(message ?? "") + 4,
    ),
  )
  const index = Math.max(0, Math.min(selectedIndex, items.length - 1))

  useEffect(() => {
    setSelectedIndex(0)
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
    const revealSelection = () =>
      scrollRef.current?.scrollChildIntoView(`${id}-item-${index}`)
    revealSelection()
    renderer.once(CliRenderEvents.FRAME, revealSelection)
    return () => {
      renderer.off(CliRenderEvents.FRAME, revealSelection)
    }
  }, [id, index, items.length, renderer, visibleCount])

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
        {items.map((item, itemIndex) => (
          <box
            key={item.key}
            id={`${id}-item-${itemIndex}`}
            height={1}
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
        ))}
      </scrollbox>
    </box>,
    renderer.root,
    null,
  )
}
