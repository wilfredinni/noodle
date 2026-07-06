import { useCallback, useState, useEffect, useMemo, useRef } from "react"
import { TextAttributes } from "@opentui/core"
import { PickerOverlay } from "./PickerOverlay"
import { useTheme } from "./theme"

export interface CommandItem {
  id: string
  label: string
  section: string
  keybinding?: string
  run: () => boolean
}

type PaletteItem =
  | { type: "header"; id: string; section: string }
  | {
      type: "command"
      id: string
      label: string
      section: string
      keybinding?: string
      run: () => boolean
    }

function isCmd(
  item: PaletteItem,
): item is PaletteItem & { type: "command"; run: () => boolean } {
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
    if (visible) {
      const first = displayItems.find(isNavigable)
      setHighlightedId(first?.id ?? null)
    }
  }, [visible, displayItems])

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
      setHighlightedId(item?.id ?? null)
    },
    [],
  )

  const highlightedItem = useMemo(() => {
    if (!highlightedId) return displayItems.find(isNavigable) ?? null
    return displayItems.find((i) => i.id === highlightedId) ?? null
  }, [displayItems, highlightedId])

  const handleSelect = useCallback(
    (item: PaletteItem) => {
      if (isCmd(item)) {
        const shouldClose = item.run()
        if (shouldClose) onClose()
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
        return (
          <box flexGrow={1}>
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
      isNavigable={isNavigable}
      onHighlightChange={handleHighlightChange}
      onSelect={handleSelect}
      onClose={onClose}
    />
  )
}
