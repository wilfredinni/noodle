import { useCallback, useState, useEffect, useMemo } from "react"
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
  | { type: "spacer"; id: string }

function isNavigable(item: PaletteItem): boolean {
  return item.type === "command"
}

function isCmd(
  item: PaletteItem,
): item is PaletteItem & { type: "command"; run: () => void } {
  return item.type === "command"
}

function buildDisplayItems(commands: CommandItem[]): PaletteItem[] {
  const seen = new Set<string>()
  const items: PaletteItem[] = []
  for (const c of commands) {
    if (!seen.has(c.section)) {
      if (seen.size > 0) {
        items.push({ type: "spacer", id: `spacer:${c.section}` })
      }
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

  const displayItems = useMemo(() => buildDisplayItems(commands), [commands])

  useEffect(() => {
    if (visible) setHighlightedId(null)
  }, [visible])

  const highlightedItem = useMemo(() => {
    if (!highlightedId) return displayItems.find(isNavigable) ?? null
    return displayItems.find((i) => i.id === highlightedId) ?? null
  }, [displayItems, highlightedId])

  const keyExtractor = useCallback((item: PaletteItem) => item.id, [])

  const filter = useCallback(
    (item: PaletteItem, query: string) => {
      if (!query) return true
      if (item.type === "header") {
        return commands.some(
          (c) =>
            c.section === item.section &&
            c.label.toLowerCase().includes(query.toLowerCase()),
        )
      }
      if (item.type === "spacer") return true
      return item.label.toLowerCase().includes(query.toLowerCase())
    },
    [commands],
  )

  const handleHighlightChange = useCallback(
    (item: PaletteItem | null) => {
      if (!item || !isNavigable(item)) {
        if (!item) {
          setHighlightedId(null)
          return
        }
        const idx = displayItems.indexOf(item)
        if (idx < 0) return
        // when wrapping hits the first header, figure direction from current highlight
        if (item.type === "header" && idx === 0) {
          const firstCmd = displayItems.find(isNavigable)
          const lastCmd = [...displayItems].reverse().find(isNavigable)
          if (highlightedId === firstCmd?.id && lastCmd) {
            setHighlightedId(lastCmd.id)
            return
          }
          if (highlightedId === lastCmd?.id && firstCmd) {
            setHighlightedId(firstCmd.id)
            return
          }
        }
        const before = displayItems.slice(0, idx).reverse().find(isNavigable)
        const after = displayItems.slice(idx + 1).find(isNavigable)
        // prefer the candidate that moves away from current position
        if (before && before.id !== highlightedId) {
          setHighlightedId(before.id)
        } else if (after && after.id !== highlightedId) {
          setHighlightedId(after.id)
        } else {
          setHighlightedId(before?.id ?? after?.id ?? null)
        }
      } else {
        setHighlightedId(item.id)
      }
    },
    [displayItems, highlightedId],
  )

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
        return (
          <box flexGrow={1}>
            <text fg={theme.primary} attributes={TextAttributes.BOLD}>
              {item.section}
            </text>
          </box>
        )
      }
      if (item.type === "spacer") {
        return <box height={1} />
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
