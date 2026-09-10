import { useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { stringWidth } from "bun"
import {
  MouseButton,
  type InputRenderable,
  type ScrollBoxRenderable,
} from "@opentui/core"
import { useKeymap } from "@opentui/keymap/react"
import { useTheme } from "./theme"
import { ResponseFilter } from "./ResponseFilter"
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
  parent: number | null
  depth: number
  open: boolean
  count: string
  nameWidth: number
  preview: string
}

export interface VisualSession {
  parsed: VisualBody
  query: string
  searchVisible: boolean
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
const previewWidth = (row: Row, width: number) =>
  Math.max(1, width - indentWidth(row) - 12 - row.nameWidth)
const canExpand = (row: Row, width: number) =>
  row.node.children.length > 0 ||
  (row.node.kind === "value" &&
    stringWidth(singleLine(row.node.value)) > previewWidth(row, width))

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
  const previews = new Map<number, string>()
  const pending = [
    { node: root, parent: null as VisualNode | null, depth: 0, nameWidth: 12 },
  ]
  while (pending.length) {
    const { node, parent, depth, nameWidth } = pending.pop()!
    const children = visualChildren(node, query, matches)
    const automatic =
      query !== "" && node.children.some((child) => matches.has(child.id))
    const open = query
      ? (overrides.get(node.id) ?? (expanded.has(node.id) || automatic))
      : expanded.has(node.id)
    const count =
      node.kind === "array"
        ? `(${children.length}/${node.children.length}) `
        : ""
    const preview = previews.get(node.id) ?? visualSummary(node)
    rows.push({
      key: `node-${node.id}`,
      node,
      parent: parent?.id ?? null,
      depth,
      nameWidth,
      open,
      count,
      preview,
    })
    if (!open || node.kind === "value") continue
    const childNameWidth = Math.min(
      24,
      Math.max(6, Math.floor((width - Math.min(depth + 1, 12) * 2 - 11) / 2)),
      children.reduce(
        (max, child) => Math.max(max, stringWidth(singleLine(child.label)) + 2),
        0,
      ),
    )
    if (node.kind === "array") {
      const records = node.children
        .filter((child) => child.kind === "object")
        .map((record) => ({
          id: record.id,
          cells: record.children
            .slice(0, 3)
            .map(
              (child) =>
                `${singleLine(child.label)}: ${singleLine(visualSummary(child))}`,
            ),
        }))
      const widths = [0, 0, 0]
      for (const { cells } of records)
        cells.forEach((cell, index) => {
          widths[index] = Math.max(widths[index]!, stringWidth(cell))
        })
      const columns = widths
        .map((natural, index) => ({ natural, index }))
        .filter(({ natural }) => natural > 0)
        .sort((a, b) => a.natural - b.natural)
      let remaining = Math.max(
        0,
        width -
          Math.min(depth + 1, 12) * 2 -
          12 -
          childNameWidth -
          Math.max(0, columns.length - 1) * 3,
      )
      columns.forEach(({ natural, index }, position) => {
        widths[index] = Math.min(
          natural,
          Math.max(1, Math.floor(remaining / (columns.length - position))),
        )
        remaining -= widths[index]!
      })
      for (const { id, cells } of records)
        if (cells.length)
          previews.set(
            id,
            cells
              .map((cell, index) => {
                const clipped = truncateToWidth(cell, widths[index]!)
                return (
                  clipped +
                  (index < cells.length - 1
                    ? " ".repeat(widths[index]! - stringWidth(clipped))
                    : "")
                )
              })
              .join(" · "),
          )
    }
    for (let index = children.length - 1; index >= 0; index--)
      pending.push({
        node: children[index]!,
        parent: node,
        depth: depth + 1,
        nameWidth: childNameWidth,
      })
  }
  return rows
}

// Keep long values windowed while matching the Cookies/Results row layout.
function rowText(row: Row, width: number, left: number, query: string) {
  const chevron = canExpand(row, width) ? (row.open ? "▾" : "▸") : " "
  const prefix = `${" ".repeat(indentWidth(row) + 1)}${chevron} `
  const kind = row.node.kind.toUpperCase().padEnd(8)
  const name = truncateToWidth(singleLine(row.node.label), row.nameWidth - 1)
  const label =
    name + " ".repeat(Math.max(1, row.nameWidth - stringWidth(name)))
  let summary = singleLine(row.preview)
  const valueWidth = previewWidth(row, width)
  const match = query ? summary.toLowerCase().indexOf(query.toLowerCase()) : -1
  if (!row.open && match > valueWidth / 2)
    summary = `…${summary.slice(Math.max(0, match - 8))}`
  const value =
    row.count +
    (row.open && row.node.kind === "value"
      ? summary
      : truncateToWidth(summary, valueWidth))
  const parts = [
    { text: prefix, color: "textMuted" as const },
    { text: kind, color: "primary" as const },
    { text: label, color: "text" as const },
    { text: value, color: "textMuted" as const },
  ]
  const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" })
  let position = 0
  return parts.map(({ text, color }) => {
    let offset = position
    let result = ""
    for (const { segment } of segments.segment(text)) {
      if (position >= left + width + 2) break
      const next = position + stringWidth(segment)
      if (next > left) {
        if (!result) offset = position
        result += segment
      }
      position = next
    }
    return { text: result, offset, color }
  })
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
  const [searchVisible, setSearchVisible] = useState(
    saved?.searchVisible ?? false,
  )
  const [searching, setSearching] = useState(saved?.searchVisible ?? false)
  const [expanded, setExpanded] = useState<Set<number>>(
    () =>
      saved?.expanded ??
      new Set(parsed.kind === "success" ? [parsed.root.id] : []),
  )
  const [selected, setSelected] = useState(saved?.selected ?? 0)
  const pendingSelection = useRef<number | null>(null)
  const [searchOverrides, setSearchOverrides] = useState<Map<number, boolean>>(
    () => saved?.searchOverrides ?? new Map(),
  )
  const [hovered, setHovered] = useState<string | null>(null)
  const [left, setLeft] = useState(0)
  const [top, setTop] = useState(0)
  const [size, setSize] = useState({ width: 60, height: 10 })
  const viewportHeight = size.height
  const active = focused && keymap.getData("app.overlay") === "none"
  const rows = useMemo(
    () =>
      parsed.kind === "success"
        ? buildRows(parsed.root, expanded, settled, size.width, searchOverrides)
        : [],
    [parsed, expanded, settled, size.width, searchOverrides],
  )
  const matchCount = useMemo(() => {
    if (!settled || parsed.kind !== "success") return 0
    const needle = settled.toLowerCase()
    const pending = [parsed.root]
    let count = 0
    while (pending.length) {
      const node = pending.pop()!
      if (
        node.label.toLowerCase().includes(needle) ||
        node.value.toLowerCase().includes(needle)
      )
        count++
      for (const child of node.children) pending.push(child)
    }
    return count
  }, [parsed, settled])
  const selectedIndex = Math.min(selected, Math.max(0, rows.length - 1))
  useEffect(() => {
    if (pendingSelection.current === null) return
    const index = rows.findIndex(
      (row) => row.node.id === pendingSelection.current,
    )
    pendingSelection.current = null
    if (index < 0) return
    setSelected(index)
    const scroll = scrollRef.current
    if (scroll && index < scroll.scrollTop) scroll.scrollTo(index)
  }, [rows])
  const start = Math.max(0, Math.min(Math.floor(top) - 3, rows.length - 1))
  const end = Math.min(rows.length, start + viewportHeight + 6)
  const contentWidth = useMemo(
    () =>
      rows.reduce(
        (max, row) =>
          Math.max(
            max,
            row.open && row.node.kind === "value"
              ? indentWidth(row) +
                  11 +
                  row.nameWidth +
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
      searchVisible,
      settled,
      expanded,
      selected,
      searchOverrides,
    }
  }, [
    sessionRef,
    parsed,
    query,
    searchVisible,
    settled,
    expanded,
    selected,
    searchOverrides,
  ])

  useEffect(() => {
    if (lastParsed.current === parsed) return
    lastParsed.current = parsed
    setSearchOverrides(new Map())
    setQuery("")
    setSettled("")
    setExpanded(new Set(parsed.kind === "success" ? [parsed.root.id] : []))
    setSelected(0)
    setTop(0)
    setSearchVisible(false)
    setSearching(false)
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
    onSearchFocusChange(active && searchVisible)
    if (active && searching && searchVisible) inputRef.current?.focus()
    else inputRef.current?.blur()
    return () => onSearchFocusChange(false)
  }, [active, searching, searchVisible, onSearchFocusChange])
  useEffect(() => {
    searchRef.current = {
      focus: () => {
        setSearchVisible(true)
        setSearching(true)
      },
    }
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
    const resize = () => {
      if (scroll.viewport.width === 0 || scroll.viewport.height === 0) return
      setSize({
        width: Math.max(1, scroll.viewport.width),
        height: Math.max(1, scroll.viewport.height),
      })
    }
    resize()
    scroll.viewport.on("resize", resize)
    scroll.verticalScrollBar.on("change", change)
    scroll.horizontalScrollBar.on("change", horizontal)
    return () => {
      scroll.viewport.off("resize", resize)
      scroll.verticalScrollBar.off("change", change)
      scroll.horizontalScrollBar.off("change", horizontal)
    }
  }, [hasRows])

  const toggle = (index: number) => {
    const row = rows[index]
    if (!row || !canExpand(row, size.width)) return
    pendingSelection.current = row.node.id
    const siblings = rows.filter(
      (candidate) =>
        candidate.parent === row.parent && candidate.node.id !== row.node.id,
    )
    if (settled) {
      setSearchOverrides((previous) => {
        const next = new Map(previous)
        if (!row.open)
          for (const sibling of siblings) next.set(sibling.node.id, false)
        return next.set(row.node.id, !row.open)
      })
      return
    }
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(row.node.id)) next.delete(row.node.id)
      else {
        for (const sibling of siblings) next.delete(sibling.node.id)
        next.add(row.node.id)
      }
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
          if (searchVisible && key.name === "escape") {
            setSearchVisible(false)
            setSearching(false)
            setQuery("")
            setSettled("")
          } else if (searching) {
            return
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
              ? Math.max(1, viewportHeight - 1)
              : 1
            if (key.name === "home") next = 0
            else if (key.name === "end") next = rows.length - 1
            else
              next += ["up", "pageup"].includes(key.name) ? -distance : distance
            if (key.name === "up" && next < 0) next = rows.length - 1
            if (key.name === "down" && next >= rows.length) next = 0
            next = Math.max(0, Math.min(rows.length - 1, next))
            setSelected(next)
            const scroll = scrollRef.current
            if (scroll) {
              if (next < scroll.scrollTop) scroll.scrollTo(next)
              else if (next >= scroll.scrollTop + viewportHeight)
                scroll.scrollTo(next - viewportHeight + 1)
            }
          } else if (key.name === "return" || key.name === "space")
            toggle(selectedIndex)
          else return
          key.preventDefault()
          key.stopPropagation()
        },
        { priority: 80 },
      ),
    [
      keymap,
      focused,
      searching,
      searchVisible,
      selectedIndex,
      rows,
      viewportHeight,
    ],
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
      {searchVisible && (
        <ResponseFilter
          id="response-visual-search"
          inputRef={inputRef}
          value={query}
          onInput={setQuery}
          placeholder="Keys or values…"
          onMouseDown={() => {
            onPaneFocus?.()
            setSearching(true)
          }}
        >
          {settled ? (
            <text
              fg={theme.success}
            >{`${matchCount} match${matchCount === 1 ? "" : "es"}`}</text>
          ) : (
            <text fg={theme.textMuted}>
              Enter a key or value to filter this response
            </text>
          )}
        </ResponseFilter>
      )}
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
                  active &&
                  ((!searching && selectedIndex === start + offset) ||
                    hovered === row.key)
                    ? theme.backgroundElement
                    : undefined
                }
                onMouseOver={() => setHovered(row.key)}
                onMouseOut={() => setHovered(null)}
                onMouseDown={(event) => {
                  if (
                    event.button !== MouseButton.LEFT ||
                    keymap.getData("app.overlay") !== "none"
                  )
                    return
                  onPaneFocus?.()
                  setSearching(false)
                  setSelected(start + offset)
                  toggle(start + offset)
                  event.stopPropagation()
                }}
              >
                {rowText(row, size.width, left, settled).map((part, index) => (
                  <text
                    key={index}
                    position="absolute"
                    left={part.offset}
                    wrapMode="none"
                    fg={theme[part.color]}
                  >
                    {highlight(part.text)}
                  </text>
                ))}
              </box>
            ))}
          </box>
        </scrollbox>
      )}
    </box>
  )
}
