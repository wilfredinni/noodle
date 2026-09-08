import { useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { stringWidth } from "bun"
import {
  MouseButton,
  type InputRenderable,
  type ScrollBoxRenderable,
} from "@opentui/core"
import { useKeymap } from "@opentui/keymap/react"
import { useTheme } from "./theme"
import { truncateToWidth } from "./format"
import {
  visualChildren,
  visualMatches,
  visualSummary,
  type VisualBody,
  type VisualNode,
} from "./responseVisual"

export interface VisualSearchController {
  focus: () => void
}

interface Row {
  key: string
  node: VisualNode
  depth: number
  open: boolean
  count: string
  columns?: string[]
  header?: boolean
}

export interface VisualSession {
  parsed: VisualBody
  query: string
  settled: string
  expanded: Set<number>
  selected: number
  searchOverrides: Map<number, boolean>
}

const singleLine = (value: string) =>
  // Render response control characters as visible text, never terminal commands.
  // eslint-disable-next-line no-control-regex
  value.replace(/[\x00-\x1f\x7f]/g, (character) =>
    JSON.stringify(character).slice(1, -1),
  )
const indentWidth = (row: Row) => Math.min(row.depth, 12) * 2

function buildRows(
  root: VisualNode,
  expanded: Set<number>,
  query: string,
  width: number,
  overrides: Map<number, boolean>,
): Row[] {
  const matches = visualMatches(root, query)
  if (query && !matches.has(root.id)) return []
  const rows: Row[] = []
  type Work = {
    node: VisualNode
    depth: number
    columns?: string[]
    header?: boolean
  }
  const pending: Work[] = [{ node: root, depth: 0 }]
  while (pending.length) {
    const { node, depth, columns, header } = pending.pop()!
    if (header) {
      rows.push({
        key: `header-${node.id}`,
        node,
        depth,
        columns,
        header: true,
        open: false,
        count: "",
      })
      continue
    }
    const children = visualChildren(node, query, matches)
    const automatic =
      query !== "" && node.children.some((child) => matches.has(child.id))
    const open = query
      ? (overrides.get(node.id) ?? (expanded.has(node.id) || automatic))
      : expanded.has(node.id)
    const count =
      node.kind === "array"
        ? ` (${children.length}/${node.children.length})`
        : ""
    rows.push({ key: `node-${node.id}`, node, depth, columns, open, count })
    if (!open || node.kind === "value") continue
    const table =
      width >= 60 &&
      node.kind === "array" &&
      node.children.length > 0 &&
      node.children.every((child) => child.kind === "object")
    let tableColumns: string[] | undefined
    if (table) {
      const keys = new Set<string>()
      for (const record of node.children)
        for (const field of record.children) keys.add(field.label)
      if (keys.size) tableColumns = [...keys]
    }
    for (let index = children.length - 1; index >= 0; index--)
      pending.push({
        node: children[index]!,
        depth: depth + 1,
        columns: tableColumns,
      })
    if (tableColumns)
      pending.push({
        node,
        depth: depth + 1,
        columns: tableColumns,
        header: true,
      })
  }
  return rows
}

// Rows and columns are windowed independently, including sparse heterogeneous tables.
function rowText(
  row: Row,
  width: number,
  left: number,
  query: string,
): { text: string; offset: number } {
  const indent = " ".repeat(indentWidth(row))
  const prefix = `${indent}${row.open ? "▾" : "▸"} `
  if (row.columns) {
    const first = Math.max(0, Math.floor((left - indent.length - 2) / 25))
    const count = Math.ceil(width / 25) + 2
    const values = new Map(
      row.node.children.map((child) => [child.label, child]),
    )
    const cells = row.columns.slice(first, first + count).map((key) => {
      const value = row.header
        ? key
        : values.has(key)
          ? visualSummary(values.get(key)!)
          : "(missing)"
      const clipped = truncateToWidth(singleLine(value), 22)
      return clipped + " ".repeat(Math.max(0, 22 - stringWidth(clipped)))
    })
    return {
      text: `${first === 0 ? (row.header ? `${indent}  ` : prefix) : ""}${cells.join(" │ ")}`,
      offset: first === 0 ? 0 : indent.length + 2 + first * 25,
    }
  }
  let summary = singleLine(visualSummary(row.node))
  const label = singleLine(row.node.label)
  const previewWidth = Math.max(
    12,
    width - indent.length - stringWidth(label) - 6,
  )
  const match = query ? summary.toLowerCase().indexOf(query.toLowerCase()) : -1
  if (!row.open && match > previewWidth / 2)
    summary = `…${summary.slice(Math.max(0, match - 8))}`
  const text = `${prefix}${label}${row.count}: ${row.open && row.node.kind === "value" ? summary : truncateToWidth(summary, previewWidth)}`
  // Slice only at grapheme boundaries so wide characters stay aligned while scrolling.
  let offset = 0
  let result = ""
  let position = 0
  const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" })
  for (const { segment } of segments.segment(text)) {
    const next = position + stringWidth(segment)
    if (position >= left + width + 2) break
    if (next > left) {
      if (!result) offset = position
      result += segment
    }
    position = next
  }
  return { text: result, offset }
}

export function ResponseVisualBody({
  parsed,
  focused,
  searchRef,
  sessionRef,
  onSearchFocusChange,
  onPaneFocus,
}: {
  parsed: VisualBody
  focused: boolean
  searchRef: RefObject<VisualSearchController | null>
  sessionRef: RefObject<VisualSession | null>
  onSearchFocusChange: (focused: boolean) => void
  onPaneFocus?: () => void
}) {
  const theme = useTheme()
  const keymap = useKeymap()
  const inputRef = useRef<InputRenderable | null>(null)
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const saved =
    sessionRef.current?.parsed === parsed ? sessionRef.current : null
  const [query, setQuery] = useState(saved?.query ?? "")
  const [settled, setSettled] = useState(saved?.settled ?? "")
  const [searching, setSearching] = useState(true)
  const [expanded, setExpanded] = useState<Set<number>>(
    () =>
      saved?.expanded ??
      new Set(parsed.kind === "success" ? [parsed.root.id] : []),
  )
  const [selected, setSelected] = useState(saved?.selected ?? 0)
  const [searchOverrides, setSearchOverrides] = useState<Map<number, boolean>>(
    () => saved?.searchOverrides ?? new Map(),
  )
  const [left, setLeft] = useState(0)
  const [top, setTop] = useState(0)
  const [size, setSize] = useState({ width: 60, height: 10 })
  const active = focused && keymap.getData("app.overlay") === "none"
  const rows = useMemo(
    () =>
      parsed.kind === "success"
        ? buildRows(parsed.root, expanded, settled, size.width, searchOverrides)
        : [],
    [parsed, expanded, settled, size.width, searchOverrides],
  )
  const selectedIndex = Math.min(selected, Math.max(0, rows.length - 1))
  const start = Math.max(0, Math.min(Math.floor(top) - 3, rows.length - 1))
  const end = Math.min(rows.length, start + size.height + 6)
  const contentWidth = useMemo(
    () =>
      rows.reduce(
        (max, row) =>
          Math.max(
            max,
            row.columns
              ? indentWidth(row) + 2 + row.columns.length * 25
              : row.open && row.node.kind === "value"
                ? indentWidth(row) +
                  4 +
                  stringWidth(singleLine(row.node.label)) +
                  stringWidth(singleLine(row.node.value))
                : size.width,
          ),
        size.width,
      ),
    [rows, size.width],
  )
  const lastParsed = useRef(parsed)
  const lastQuery = useRef(settled)
  useEffect(() => {
    sessionRef.current = {
      parsed,
      query,
      settled,
      expanded,
      selected,
      searchOverrides,
    }
  }, [sessionRef, parsed, query, settled, expanded, selected, searchOverrides])

  useEffect(() => {
    if (lastParsed.current === parsed) return
    lastParsed.current = parsed
    setSearchOverrides(new Map())
    setQuery("")
    setSettled("")
    setExpanded(new Set(parsed.kind === "success" ? [parsed.root.id] : []))
    setSelected(0)
    setTop(0)
    setSearching(true)
    scrollRef.current?.scrollTo({ x: 0, y: 0 })
  }, [parsed])
  useEffect(() => {
    const timer = setTimeout(() => setSettled(query.trim()), 150)
    return () => clearTimeout(timer)
  }, [query])
  useEffect(() => {
    if (lastQuery.current === settled) return
    lastQuery.current = settled
    setSearchOverrides(new Map())
    setSelected(0)
    setTop(0)
    scrollRef.current?.scrollTo({ x: 0, y: 0 })
  }, [settled])
  useEffect(() => {
    onSearchFocusChange(active && searching)
    if (active && searching) inputRef.current?.focus()
    else inputRef.current?.blur()
    return () => onSearchFocusChange(false)
  }, [active, searching, onSearchFocusChange])
  useEffect(() => {
    searchRef.current = { focus: () => setSearching(true) }
    return () => {
      searchRef.current = null
    }
  }, [searchRef])
  const hasRows = rows.length > 0
  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    const change = ({ position }: { position: number }) => setTop(position)
    const horizontal = ({ position }: { position: number }) => setLeft(position)
    scroll.verticalScrollBar.on("change", change)
    scroll.horizontalScrollBar.on("change", horizontal)
    return () => {
      scroll.verticalScrollBar.off("change", change)
      scroll.horizontalScrollBar.off("change", horizontal)
    }
  }, [hasRows])

  const toggle = (index: number) => {
    const row = rows[index]
    if (!row || row.header) return
    if (settled) {
      setSearchOverrides((previous) =>
        new Map(previous).set(row.node.id, !row.open),
      )
      return
    }
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(row.node.id)) next.delete(row.node.id)
      else next.add(row.node.id)
      return next
    })
  }
  useEffect(
    () =>
      keymap.intercept(
        "key",
        (ctx) => {
          if (!focused || keymap.getData("app.overlay") !== "none") return
          const key = ctx.event
          if (key.ctrl || key.meta || key.option) return
          if (searching) {
            if (key.name !== "return" && key.name !== "escape") return
            setSearching(false)
          } else if (
            key.shift &&
            (key.name === "left" || key.name === "right")
          ) {
            scrollRef.current?.scrollBy({
              x: key.name === "left" ? -10 : 10,
              y: 0,
            })
          } else if (
            ["up", "down", "pageup", "pagedown", "home", "end"].includes(
              key.name,
            )
          ) {
            let next = selectedIndex
            const distance = key.name.startsWith("page")
              ? Math.max(1, size.height - 1)
              : 1
            if (key.name === "home") next = 0
            else if (key.name === "end") next = rows.length - 1
            else
              next += ["up", "pageup"].includes(key.name) ? -distance : distance
            next = Math.max(0, Math.min(rows.length - 1, next))
            if (rows[next]?.header)
              next = Math.max(
                0,
                Math.min(
                  rows.length - 1,
                  next + (next < selectedIndex ? -1 : 1),
                ),
              )
            setSelected(next)
            const scroll = scrollRef.current
            if (scroll) {
              if (next < scroll.scrollTop) scroll.scrollTo(next)
              else if (next >= scroll.scrollTop + size.height)
                scroll.scrollTo(next - size.height + 1)
            }
          } else if (key.name === "return") toggle(selectedIndex)
          else return
          key.preventDefault()
          key.stopPropagation()
        },
        { priority: 80 },
      ),
    [keymap, focused, searching, selectedIndex, rows, size.height],
  )

  const highlight = (text: string) => {
    if (!settled) return text
    const lower = text.toLowerCase()
    const needle = settled.toLowerCase()
    const parts = []
    let offset = 0
    for (
      let index = lower.indexOf(needle);
      index !== -1;
      index = lower.indexOf(needle, offset)
    ) {
      parts.push(
        <span key={`plain-${offset}`}>{text.slice(offset, index)}</span>,
      )
      parts.push(
        <span key={`match-${index}`} fg={theme.primary}>
          <b>
            <u>{text.slice(index, index + needle.length)}</u>
          </b>
        </span>,
      )
      offset = index + needle.length
    }
    parts.push(<span key="tail">{text.slice(offset)}</span>)
    return parts
  }

  return (
    <box
      style={{
        flexDirection: "column",
        flexGrow: 1,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <box style={{ flexDirection: "row", flexShrink: 0 }}>
        <text fg={theme.textMuted}>Search </text>
        <input
          id="response-visual-search"
          ref={inputRef}
          value={query}
          onInput={setQuery}
          placeholder="Keys or values…"
          backgroundColor={theme.background}
          focusedBackgroundColor={theme.background}
          textColor={theme.text}
          cursorColor={theme.primary}
          onMouseDown={() => {
            onPaneFocus?.()
            setSearching(true)
          }}
          style={{ flexGrow: 1 }}
        />
      </box>
      <text fg={theme.textMuted} height={1}>
        {searching
          ? "Enter browse · Esc leave search"
          : "↑/↓ select · Enter details · Shift+←/→ scroll"}
      </text>
      {parsed.kind !== "success" ? (
        <text fg={parsed.kind === "error" ? theme.warning : theme.textMuted}>
          {parsed.message}
        </text>
      ) : rows.length === 0 ? (
        <text fg={theme.textMuted}>No matches</text>
      ) : (
        <scrollbox
          id="response-visual-scroll"
          ref={scrollRef}
          scrollX
          scrollY
          onSizeChange={function () {
            setSize({
              width: Math.max(1, this.width - 1),
              height: Math.max(1, this.height - 1),
            })
          }}
          verticalScrollbarOptions={{
            trackOptions: {
              backgroundColor: theme.background,
              foregroundColor: theme.borderActive,
            },
          }}
          horizontalScrollbarOptions={{
            trackOptions: {
              backgroundColor: theme.background,
              foregroundColor: theme.borderActive,
            },
          }}
          style={{ flexGrow: 1, minHeight: 0, flexBasis: 0 }}
        >
          <box height={rows.length} width={contentWidth} flexShrink={0}>
            {rows.slice(start, end).map((row, offset) => (
              <box
                key={row.key}
                id={`visual-${row.key}`}
                position="absolute"
                top={start + offset}
                left={0}
                height={1}
                width={contentWidth}
                backgroundColor={
                  !searching && focused && selectedIndex === start + offset
                    ? theme.backgroundElement
                    : undefined
                }
                onMouseDown={(event) => {
                  if (
                    event.button !== MouseButton.LEFT ||
                    keymap.getData("app.overlay") !== "none" ||
                    row.header
                  )
                    return
                  onPaneFocus?.()
                  setSearching(false)
                  setSelected(start + offset)
                  toggle(start + offset)
                  event.stopPropagation()
                }}
              >
                {(() => {
                  const display = rowText(row, size.width, left, settled)
                  return (
                    <text
                      position="absolute"
                      left={display.offset}
                      wrapMode="none"
                      fg={row.header ? theme.primary : theme.text}
                    >
                      {highlight(display.text)}
                    </text>
                  )
                })()}
              </box>
            ))}
          </box>
        </scrollbox>
      )}
    </box>
  )
}
