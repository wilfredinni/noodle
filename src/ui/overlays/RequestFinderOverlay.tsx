import { useCallback, useEffect, useMemo, useState } from "react"
import { TextAttributes } from "@opentui/core"
import type { CollectionItem, Environment, Request } from "../../schema"
import { methodColor } from "../formatRequest"
import {
  requestFinderItems,
  searchRequests,
  type FinderItem,
} from "../requestFinder"
import { contrastOnPrimary, useTheme } from "../theme"
import { PickerOverlay } from "./PickerOverlay"

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`
}

export function RequestFinderOverlay({
  visible,
  collectionItems,
  requests,
  activeEnv,
  onSelect,
  onClose,
}: {
  visible: boolean
  collectionItems?: CollectionItem[]
  requests?: Request[]
  activeEnv: Environment | null
  onSelect: (item: FinderItem) => void
  onClose: () => void
}) {
  const theme = useTheme()
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const items = useMemo(
    () => requestFinderItems(collectionItems ?? requests ?? [], activeEnv),
    [collectionItems, requests, activeEnv],
  )

  useEffect(() => {
    if (visible) {
      const first = items[0]
      setHighlightedId(first ? `${first.type}:${first.id}` : null)
    }
  }, [visible, items])

  const keyExtractor = useCallback(
    (item: FinderItem) => `${item.type}:${item.id}`,
    [],
  )
  const filter = useCallback((_item: FinderItem, _query: string) => true, [])
  const sortItems = useCallback(
    (matches: FinderItem[], query: string) => searchRequests(matches, query),
    [],
  )
  const highlightedItem = useMemo(
    () =>
      items.find((item) => `${item.type}:${item.id}` === highlightedId) ??
      items[0] ??
      null,
    [items, highlightedId],
  )
  const handleHighlightChange = useCallback(
    (item: FinderItem | null) =>
      setHighlightedId(item ? `${item.type}:${item.id}` : null),
    [],
  )
  const renderItem = useCallback(
    (
      item: FinderItem,
      { highlighted }: { highlighted: boolean; active: boolean },
    ) => {
      const highlightedForeground = contrastOnPrimary(theme)
      const fg = highlighted ? highlightedForeground : theme.text
      const mutedFg = highlighted ? highlightedForeground : theme.textMuted

      if (item.type === "request") {
        const tags = item.tags.map((tag) => `#${tag}`).join(" ")
        return (
          <box flexDirection="column" flexGrow={1}>
            <box flexDirection="row">
              <text
                fg={
                  highlighted
                    ? highlightedForeground
                    : methodColor(item.request.method, theme)
                }
              >
                {item.request.method.padEnd(8)}
              </text>
              <text fg={fg} attributes={TextAttributes.BOLD} wrapMode="none">
                {truncate(item.name, 28)}
              </text>
              <box flexGrow={1} />
              <text fg={mutedFg} wrapMode="none">
                {truncate(item.folderPath, 20)}
              </text>
            </box>
            {tags && (
              <box paddingLeft={8}>
                <text fg={mutedFg} wrapMode="none">
                  {truncate(tags, 48)}
                </text>
              </box>
            )}
          </box>
        )
      }

      const countSuffix = `(${item.requestCount} req${item.requestCount === 1 ? "" : "s"})`
      const displayPath =
        item.folderPath === "(root)" ? "" : `${truncate(item.folderPath, 14)} `
      const rightText = `${displayPath}${countSuffix}`

      return (
        <box flexDirection="row" flexGrow={1}>
          <text fg={highlighted ? highlightedForeground : theme.info}>
            {"FOLDER".padEnd(8)}
          </text>
          <text fg={fg} attributes={TextAttributes.BOLD} wrapMode="none">
            {truncate(item.name, 28)}
          </text>
          <box flexGrow={1} />
          <text fg={mutedFg} wrapMode="none">
            {truncate(rightText, 22)}
          </text>
        </box>
      )
    },
    [theme],
  )

  return (
    <PickerOverlay
      visible={visible}
      title="Find Request"
      width={68}
      placeholder="Search requests..."
      items={items}
      keyExtractor={keyExtractor}
      filter={filter}
      sortItems={sortItems}
      renderItem={renderItem}
      highlightedItem={highlightedItem}
      onHighlightChange={handleHighlightChange}
      onSelect={onSelect}
      onClose={onClose}
    />
  )
}
