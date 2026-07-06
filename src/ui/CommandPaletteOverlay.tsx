import { useCallback, useState, useEffect, useMemo, useRef } from "react"
import { TextAttributes } from "@opentui/core"
import { PickerOverlay } from "./PickerOverlay"
import { useTheme } from "./theme"

export interface CommandItem {
  id: string
  label: string
  section: string
  keybinding?: string
  run: () => void
}

type PaletteItem =
  | { type: "header"; id: string; section: string }
  | {
      type: "command"
      id: string
      label: string
      section: string
      keybinding?: string
      run: () => void
    }

function isCmd(
  item: PaletteItem,
): item is PaletteItem & { type: "command"; run: () => void } {
  return item.type === "command"
}

function isNavigable(item: PaletteItem): boolean {
  return item.type === "command"
}

function buildDisplayItems(commands: CommandItem[]): PaletteItem[] {
  const seen = new Set<string>()
  const items: PaletteItem[] = []
  for (const c of commands) {
    if (!seen.has(c.section)) {
      seen.add(c.section)
      items.push({
        type: "header",
        id: `header:${c.section}`,
        section: c.section,
      })
    }
    items.push({ type: "command", ...c })
  }
  return items
}

export function CommandPaletteOverlay({
  visible,
  commands,
  onClose,
}: {
  visible: boolean
  commands: CommandItem[]
  onClose: () => void
}) {
  const theme = useTheme()
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const queryRef = useRef("")

  const displayItems = useMemo(() => buildDisplayItems(commands), [commands])

  useEffect(() => {
    if (visible) setHighlightedId(null)
  }, [visible])

  const keyExtractor = useCallback((item: PaletteItem) => item.id, [])

  const filter = useCallback(
    (item: PaletteItem, query: string) => {
      queryRef.current = query
      if (!query) return true
      if (item.type === "command") {
        return item.label.toLowerCase().includes(query.toLowerCase())
      }
      if (item.type === "header") {
        return commands.some(
          (c) =>
            c.section === item.section &&
            c.label.toLowerCase().includes(query.toLowerCase()),
        )
      }
      return false
    },
    [commands],
  )

  const handleHighlightChange = useCallback(
    (item: PaletteItem | null) => {
      if (!item) {
        setHighlightedId(null)
        return
      }
      if (isNavigable(item)) {
        setHighlightedId(item.id)
        return
      }
      // Header — snap to nearest navigable command, direction-aware
      const visible = queryRef.current
        ? displayItems.filter((i) => filter(i, queryRef.current))
        : displayItems
      const idx = visible.indexOf(item)
      if (idx < 0) return
      const before = visible.slice(0, idx).reverse().find(isNavigable)
      const after = visible.slice(idx + 1).find(isNavigable)

      // Header at start of list — handle wrap
      if (idx === 0) {
        const last = [...visible].reverse().find(isNavigable)
        if ((highlightedId === after?.id || highlightedId === null) && last) {
          // Was on first command, pressed up — wrap to last
          setHighlightedId(last.id)
          return
        }
        // Otherwise snap to first command
        if (after) {
          setHighlightedId(after.id)
          return
        }
      }

      // Direction-aware: snap to neighbor matching highlightedId's direction
      if (before && before.id === highlightedId) {
        // Came from above (pressed down) — advance to next
        setHighlightedId(after?.id ?? before.id)
      } else if (after && after.id === highlightedId) {
        // Came from below (pressed up) — go back to previous
        setHighlightedId(before?.id ?? after.id)
      } else {
        // Initial state (null) or mismatch — prefer forward
        setHighlightedId(after?.id ?? before?.id ?? null)
      }
    },
    [displayItems, commands, filter, highlightedId],
  )

  const highlightedItem = useMemo(() => {
    if (!highlightedId) return displayItems.find(isNavigable) ?? null
    return displayItems.find((i) => i.id === highlightedId) ?? null
  }, [displayItems, highlightedId])

  const handleSelect = useCallback(
    (item: PaletteItem) => {
      if (isCmd(item)) {
        item.run()
        onClose()
      }
    },
    [onClose],
  )

  const renderItem = useCallback(
    (
      item: PaletteItem,
      { highlighted }: { highlighted: boolean; active: boolean },
    ) => {
      if (item.type === "header") {
        const visible = queryRef.current
          ? displayItems.filter((i) => filter(i, queryRef.current))
          : displayItems
        const isFirst = visible.find((i) => i.type === "header") === item
        return (
          <box flexGrow={1} paddingTop={isFirst ? 0 : 1}>
            <text fg={theme.primary} attributes={TextAttributes.BOLD}>
              {item.section}
            </text>
          </box>
        )
      }
      const baseFg = highlighted ? "#1a1a1a" : theme.text
      const mutedFg = highlighted ? "#333333" : theme.textMuted
      return (
        <>
          <text fg={baseFg}>{item.label}</text>
          <box flexGrow={1} />
          {item.keybinding && <text fg={mutedFg}>{item.keybinding}</text>}
        </>
      )
    },
    [theme],
  )

  if (!visible) return null

  return (
    <PickerOverlay
      visible={visible}
      width={60}
      title="Commands"
      placeholder="Type a command..."
      items={displayItems}
      keyExtractor={keyExtractor}
      filter={filter}
      renderItem={renderItem}
      highlightedItem={highlightedItem}
      onHighlightChange={handleHighlightChange}
      onSelect={handleSelect}
      onClose={onClose}
    />
  )
}
