import { useCallback, useState, useEffect } from "react"
import { PickerOverlay } from "./PickerOverlay"
import { useTheme } from "./theme"

export interface CommandItem {
  id: string
  label: string
  section: string
  keybinding?: string
  run: () => void
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
  const [highlightedItem, setHighlightedItem] = useState<CommandItem | null>(
    null,
  )

  useEffect(() => {
    if (visible) {
      setHighlightedItem(null)
    }
  }, [visible])

  const keyExtractor = useCallback((item: CommandItem) => item.id, [])

  const filter = useCallback(
    (item: CommandItem, query: string) =>
      item.label.toLowerCase().includes(query.toLowerCase()),
    [],
  )

  const handleSelect = useCallback(
    (item: CommandItem) => {
      item.run()
      onClose()
    },
    [onClose],
  )

  const renderItem = useCallback(
    (
      item: CommandItem,
      { highlighted }: { highlighted: boolean; active: boolean },
    ) => {
      const baseFg = highlighted ? "#1a1a1a" : theme.text
      const mutedFg = highlighted ? "#333333" : theme.textMuted
      return (
        <>
          <text fg={baseFg}>{item.label}</text>
          <box flexGrow={1} />
          <text fg={mutedFg}>{item.section}</text>
          {item.keybinding && (
            <>
              <text fg={mutedFg}> · </text>
              <text fg={mutedFg}>{item.keybinding}</text>
            </>
          )}
        </>
      )
    },
    [theme],
  )

  if (!visible) return null

  return (
    <PickerOverlay
      visible={visible}
      title="Commands"
      placeholder="Type a command..."
      items={commands}
      keyExtractor={keyExtractor}
      filter={filter}
      renderItem={renderItem}
      highlightedItem={highlightedItem}
      onHighlightChange={setHighlightedItem}
      onSelect={handleSelect}
      onClose={onClose}
    />
  )
}
