import { useCallback, useEffect, useMemo, useState } from "react"
import { basename } from "node:path"
import { TextAttributes } from "@opentui/core"
import { PickerOverlay } from "./PickerOverlay"
import { useTheme } from "../theme"

export interface CollectionSwitcherOverlayProps {
  visible: boolean
  collections: string[]
  activeCollectionDir: string
  onSelect: (collectionDir: string) => void
  onClose: () => void
}

interface CollectionItem {
  path: string
  label: string
}

export function CollectionSwitcherOverlay({
  visible,
  collections,
  activeCollectionDir,
  onSelect,
  onClose,
}: CollectionSwitcherOverlayProps) {
  const theme = useTheme()
  const [highlightedPath, setHighlightedPath] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    setHighlightedPath(activeCollectionDir)
  }, [visible, activeCollectionDir])

  const items = useMemo<CollectionItem[]>(
    () =>
      collections.map((path) => ({
        path,
        label: basename(path) || path,
      })),
    [collections],
  )

  const activeItem = useMemo(
    () => items.find((item) => item.path === activeCollectionDir) ?? null,
    [items, activeCollectionDir],
  )

  const highlightedItem = useMemo(
    () =>
      items.find((item) => item.path === highlightedPath) ??
      activeItem ??
      items[0] ??
      null,
    [items, highlightedPath, activeItem],
  )

  const keyExtractor = useCallback((item: CollectionItem) => item.path, [])

  const filter = useCallback((item: CollectionItem, query: string) => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      item.label.toLowerCase().includes(q) ||
      item.path.toLowerCase().includes(q)
    )
  }, [])

  const handleHighlightChange = useCallback((item: CollectionItem | null) => {
    setHighlightedPath(item?.path ?? null)
  }, [])

  const handleSelect = useCallback(
    (item: CollectionItem) => {
      onSelect(item.path)
    },
    [onSelect],
  )

  const renderItem = useCallback(
    (
      item: CollectionItem,
      { highlighted, active }: { highlighted: boolean; active: boolean },
    ) => {
      const fg = highlighted ? "#1a1a1a" : active ? theme.primary : theme.text
      const pathFg = highlighted ? "#333333" : theme.textMuted
      return (
        <>
          <text fg={fg} attributes={active ? TextAttributes.BOLD : undefined}>
            {active ? "●" : " "}
          </text>
          <box flexDirection="column" flexGrow={1} minWidth={0}>
            <text fg={fg} attributes={TextAttributes.BOLD}>
              {item.label}
            </text>
            <text fg={pathFg} wrapMode="none" truncate>
              {item.path}
            </text>
          </box>
        </>
      )
    },
    [theme],
  )

  return (
    <PickerOverlay
      visible={visible}
      title="Collections"
      width={72}
      placeholder="Search collections..."
      items={items}
      keyExtractor={keyExtractor}
      filter={filter}
      renderItem={renderItem}
      highlightedItem={highlightedItem}
      activeItem={activeItem}
      onHighlightChange={handleHighlightChange}
      onSelect={handleSelect}
      onClose={onClose}
    />
  )
}
