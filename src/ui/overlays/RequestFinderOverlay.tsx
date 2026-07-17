import { useCallback, useEffect, useMemo, useState } from "react"
import { TextAttributes } from "@opentui/core"
import type { Request } from "../../schema"
import { methodColor } from "../formatRequest"
import {
  requestFinderItems,
  searchRequests,
  type RequestFinderItem,
} from "../requestFinder"
import { useTheme } from "../theme"
import { PickerOverlay } from "./PickerOverlay"

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`
}

export function RequestFinderOverlay({
  visible,
  requests,
  onSelect,
  onClose,
}: {
  visible: boolean
  requests: Request[]
  onSelect: (requestId: string) => void
  onClose: () => void
}) {
  const theme = useTheme()
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const items = useMemo(() => requestFinderItems(requests), [requests])

  useEffect(() => {
    if (visible) setHighlightedId(items[0]?.request.id ?? null)
  }, [visible, items])

  const keyExtractor = useCallback(
    (item: RequestFinderItem) => item.request.id,
    [],
  )
  const filter = useCallback(
    (item: RequestFinderItem, query: string) =>
      searchRequests(items, query).some(
        (result) => result.request.id === item.request.id,
      ),
    [items],
  )
  const sortItems = useCallback(
    (_matches: RequestFinderItem[], query: string) =>
      searchRequests(items, query),
    [items],
  )
  const highlightedItem = useMemo(
    () =>
      items.find((item) => item.request.id === highlightedId) ??
      items[0] ??
      null,
    [items, highlightedId],
  )
  const handleHighlightChange = useCallback(
    (item: RequestFinderItem | null) =>
      setHighlightedId(item?.request.id ?? null),
    [],
  )
  const renderItem = useCallback(
    (
      item: RequestFinderItem,
      { highlighted }: { highlighted: boolean; active: boolean },
    ) => {
      const fg = highlighted ? "#1a1a1a" : theme.text
      const mutedFg = highlighted ? "#333333" : theme.textMuted
      return (
        <box flexDirection="column" flexGrow={1}>
          <box flexDirection="row">
            <text
              fg={
                highlighted
                  ? "#333333"
                  : methodColor(item.request.method, theme)
              }
            >
              {item.request.method.padEnd(7)}
            </text>
            <text fg={fg} attributes={TextAttributes.BOLD}>
              {item.request.name}
            </text>
            <box flexGrow={1} />
            <text fg={mutedFg}>{item.folderPath}</text>
          </box>
          <text fg={mutedFg}>{truncate(item.request.url, 62)}</text>
        </box>
      )
    },
    [theme],
  )

  return (
    <PickerOverlay
      visible={visible}
      title="Find Request"
      width={82}
      placeholder="Search requests..."
      items={items}
      keyExtractor={keyExtractor}
      filter={filter}
      sortItems={sortItems}
      renderItem={renderItem}
      highlightedItem={highlightedItem}
      onHighlightChange={handleHighlightChange}
      onSelect={(item) => onSelect(item.request.id)}
      onClose={onClose}
    />
  )
}
