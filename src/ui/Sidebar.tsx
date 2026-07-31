import { MouseButton, ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useRef, useState } from "react"
import type { CollectionItem, Method } from "../schema"
import { methodColor } from "./formatRequest"
import { useTheme } from "./theme"

export const SIDEBAR_WIDTH = 38
import { FullBorder, LeftBar } from "./borders"
import type { Keybinds } from "./keybind"
import type { VisibleNode } from "./tree"

import { extractFileErrors } from "../filestore/load"

function shortMethod(m: string): string {
  return m === "DELETE" ? "DEL" : m
}

function truncName(name: string, max: number): string {
  return name.length <= max ? name : name.slice(0, max - 1) + "\u2026"
}

import { Frame } from "./Frame"
import { Badge } from "./Badge"
import { JumpBadge, JUMP_BADGE_TOP_INDENT } from "./JumpBadge"

export function Sidebar({
  items: _items,
  loading,
  error,
  visibleItems,
  cursorIndex,
  selectedId: _selectedId,
  expanded: _expanded,
  focused = false,
  keybinds: _keybinds,
  dirtyRequestIds,
  dirtyFolderPaths,
  jumpMode = false,
  onPaneFocus,
  onRequestSelect,
  onFolderSelect,
  onFolderToggle,
  onRequestContextMenu,
  onFolderContextMenu,
}: {
  items: CollectionItem[]
  loading: boolean
  error: Error | null
  visibleItems: VisibleNode[]
  cursorIndex: number
  selectedId: string | null
  expanded: Set<string>
  focused?: boolean
  keybinds?: Keybinds
  dirtyRequestIds?: Set<string>
  dirtyFolderPaths?: Set<string>
  jumpMode?: boolean
  onPaneFocus?: () => void
  onRequestSelect?: (id: string) => void
  onFolderSelect?: (path: string) => void
  onFolderToggle?: (path: string) => void
  onRequestContextMenu?: (id: string) => void
  onFolderContextMenu?: (path: string) => void
}) {
  const theme = useTheme()
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [hoveredToggle, setHoveredToggle] = useState<string | null>(null)

  useEffect(() => {
    if (cursorIndex >= 0 && visibleItems.length > 0) {
      const idx = Math.min(cursorIndex, visibleItems.length - 1)
      scrollRef.current?.scrollChildIntoView(`so-${visibleItems[idx].id}`)
    }
  }, [cursorIndex, visibleItems])

  const fileErrors = error ? extractFileErrors(error) : []

  return (
    <Frame
      style={{
        width: SIDEBAR_WIDTH,
        flexDirection: "column",
        flexShrink: 0,
        backgroundColor: theme.backgroundPanel,
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: 1,
        paddingRight: 1,
        gap: 1,
      }}
      border={[...FullBorder.border]}
      customBorderChars={FullBorder.customBorderChars}
      borderColor={focused ? theme.primary : theme.borderSubtle}
      titleRight={
        jumpMode ? undefined : (
          <Badge
            bg={theme.backgroundPanel}
            fg={focused ? theme.primary : theme.textMuted}
          >
            Requests
          </Badge>
        )
      }
      onPaneFocus={onPaneFocus}
    >
      {jumpMode && <JumpBadge letter="s" style={JUMP_BADGE_TOP_INDENT} />}
      {loading ? (
        <box
          style={{
            flexGrow: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <text fg={theme.textMuted}>Loading...</text>
        </box>
      ) : error ? (
        <box
          style={{
            flexGrow: 1,
            flexDirection: "column",
            paddingTop: 1,
            paddingLeft: 1,
            paddingRight: 1,
            gap: 1,
          }}
        >
          <text fg={theme.error}>
            Collection {fileErrors.length > 1 ? "Errors" : "Error"} (
            {fileErrors.length})
          </text>
          <scrollbox
            scrollY
            style={{ flexGrow: 1 }}
            verticalScrollbarOptions={{
              trackOptions: {
                backgroundColor: theme.background,
                foregroundColor: theme.borderActive,
              },
            }}
          >
            {fileErrors.map((err, idx) => (
              <box
                key={idx}
                style={{
                  flexDirection: "column",
                  marginBottom: 1,
                }}
              >
                <text fg={theme.primary} wrapMode="none">
                  {err.file}
                </text>
                <text fg={theme.warning}>{err.message}</text>
                {err.snippet && (
                  <box style={{ flexDirection: "column", marginTop: 1 }}>
                    {err.snippet.split("\n").map((line, lIdx) => (
                      <text key={lIdx} fg={theme.textMuted} wrapMode="none">
                        {line}
                      </text>
                    ))}
                  </box>
                )}
              </box>
            ))}
          </scrollbox>
        </box>
      ) : visibleItems.length === 0 ? (
        <box
          style={{
            flexGrow: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <text fg={theme.textMuted}>empty</text>
        </box>
      ) : (
        <scrollbox
          ref={scrollRef}
          scrollY
          style={{ flexGrow: 1 }}
          verticalScrollbarOptions={{
            trackOptions: {
              backgroundColor: theme.background,
              foregroundColor: theme.borderActive,
            },
          }}
        >
          {visibleItems.map((node, i) => {
            const isCursor = i === cursorIndex
            const canSelectItem =
              node.type === "folder"
                ? onFolderSelect !== undefined
                : onRequestSelect !== undefined
            const isHovered = canSelectItem && hoveredItem === node.id
            if (node.type === "folder") {
              const chevron = node.expanded ? "\u25BE" : "\u25B8"
              const isFolderDirty = dirtyFolderPaths?.has(node.id)
              return (
                <box
                  key={node.id}
                  id={`so-${node.id}`}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    paddingLeft: node.depth * 2,
                    backgroundColor:
                      isCursor || isHovered
                        ? theme.backgroundElement
                        : undefined,
                  }}
                  border={[...LeftBar.border]}
                  customBorderChars={LeftBar.customBorderChars}
                  borderColor={isCursor ? theme.primary : theme.backgroundPanel}
                  onMouseDown={(event) => {
                    if (event.button === MouseButton.RIGHT) {
                      onFolderContextMenu?.(node.id)
                    } else if (event.button === MouseButton.LEFT) {
                      onFolderSelect?.(node.id)
                      onPaneFocus?.()
                    } else {
                      return
                    }
                    event.stopPropagation()
                  }}
                  onMouseOver={
                    onFolderSelect ? () => setHoveredItem(node.id) : undefined
                  }
                  onMouseOut={
                    onFolderSelect ? () => setHoveredItem(null) : undefined
                  }
                >
                  <box style={{ flexDirection: "row" }}>
                    <box
                      onMouseDown={(event) => {
                        if (event.button !== MouseButton.LEFT) return
                        onFolderToggle?.(node.id)
                        onPaneFocus?.()
                        event.stopPropagation()
                      }}
                      onMouseOver={
                        onFolderToggle
                          ? () => setHoveredToggle(node.id)
                          : undefined
                      }
                      onMouseOut={
                        onFolderToggle
                          ? () => setHoveredToggle(null)
                          : undefined
                      }
                    >
                      <text
                        fg={
                          hoveredToggle === node.id
                            ? theme.primary
                            : theme.textMuted
                        }
                      >
                        {chevron}{" "}
                      </text>
                    </box>
                    <text fg={theme.textMuted} wrapMode="none">
                      {truncName(node.name, 20)}
                    </text>
                  </box>
                  {isFolderDirty && <text fg={theme.warning}>{`\u25CF`}</text>}
                </box>
              )
            }
            const isDirty = dirtyRequestIds?.has(node.id)
            return (
              <box
                key={node.id}
                id={`so-${node.id}`}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingLeft: (node.depth + 1) * 2,
                  backgroundColor:
                    isCursor || isHovered ? theme.backgroundElement : undefined,
                }}
                border={[...LeftBar.border]}
                customBorderChars={LeftBar.customBorderChars}
                borderColor={isCursor ? theme.primary : theme.backgroundPanel}
                onMouseDown={(event) => {
                  if (event.button === MouseButton.RIGHT) {
                    onRequestContextMenu?.(node.id)
                  } else if (event.button === MouseButton.LEFT) {
                    onRequestSelect?.(node.id)
                    onPaneFocus?.()
                  } else {
                    return
                  }
                  event.stopPropagation()
                }}
                onMouseOver={
                  onRequestSelect ? () => setHoveredItem(node.id) : undefined
                }
                onMouseOut={
                  onRequestSelect ? () => setHoveredItem(null) : undefined
                }
              >
                <box style={{ flexDirection: "row" }}>
                  <text
                    fg={methodColor((node.method ?? "GET") as Method, theme)}
                  >
                    {shortMethod(node.method ?? "GET").padEnd(7)}
                  </text>
                  <text fg={theme.text} wrapMode="none">
                    {truncName(node.name, 20)}
                  </text>
                </box>
                {isDirty && <text fg={theme.warning}>{`\u25CF`}</text>}
              </box>
            )
          })}
        </scrollbox>
      )}
    </Frame>
  )
}
