import { useEffect, useMemo, useState, useRef } from "react"
import type { TextareaRenderable, ScrollBoxRenderable } from "@opentui/core"
import type { RefObject } from "react"
import type { Theme } from "../theme-data"
import { highlightTextarea } from "./useJsonHighlight"
import {
  highlightJsonTokens,
  tokenizeLine,
  type JsonToken,
  type SpanPart,
} from "./syntax"
import type { Environment } from "../../schema"

const VIEWPORT_HEIGHT = 35
const LARGE_BODY_BYTES = 1024 * 1024
const RAW_CHUNK_LENGTH = 1_000

interface ViewerLine {
  text: string
  offset: number
}

function viewerLines(body: string): ViewerLine[] {
  const lines: ViewerLine[] = []
  for (let start = 0; start <= body.length;) {
    const newline = body.indexOf("\n", start)
    const end = newline === -1 ? body.length : newline
    const line = body.slice(start, end)
    if (body.length <= LARGE_BODY_BYTES || line.length <= RAW_CHUNK_LENGTH) {
      lines.push({ text: line, offset: start })
    } else {
      for (
        let chunkStart = 0;
        chunkStart < line.length;
        chunkStart += RAW_CHUNK_LENGTH
      ) {
        lines.push({
          text: line.slice(chunkStart, chunkStart + RAW_CHUNK_LENGTH),
          offset: start + chunkStart,
        })
      }
    }
    if (newline === -1) break
    start = newline + 1
  }
  return lines
}

function tokenPartsForRange(
  body: string,
  tokens: JsonToken[],
  start: number,
  end: number,
  theme: Theme,
): SpanPart[] {
  const parts: SpanPart[] = []
  let lower = 0
  let upper = tokens.length
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2)
    const token = tokens[middle]!
    if (token.offset + token.text.length <= start) lower = middle + 1
    else upper = middle
  }

  let cursor = start
  for (let index = lower; index < tokens.length; index++) {
    const token = tokens[index]!
    if (token.offset >= end) break
    const tokenStart = Math.max(start, token.offset)
    const tokenEnd = Math.min(end, token.offset + token.text.length)
    if (tokenStart > cursor) {
      parts.push({
        text: body.slice(cursor, tokenStart),
        fg: theme.text,
        kind: "text",
      })
    }
    parts.push({
      text: body.slice(tokenStart, tokenEnd),
      fg: token.fg,
      kind: token.kind,
    })
    cursor = tokenEnd
  }
  if (cursor < end) {
    parts.push({ text: body.slice(cursor, end), fg: theme.text, kind: "text" })
  }
  return parts
}

function highlightEnvVarsInParts(
  parts: SpanPart[],
  env: Environment,
  theme: Theme,
): SpanPart[] {
  const result: SpanPart[] = []
  const varRe = /\$\w+/g

  for (const part of parts) {
    let lastIndex = 0
    let match: RegExpExecArray | null
    varRe.lastIndex = 0

    while ((match = varRe.exec(part.text)) !== null) {
      if (match.index > lastIndex) {
        result.push({
          text: part.text.slice(lastIndex, match.index),
          fg: part.fg,
          kind: part.kind,
        })
      }
      const varName = match[0].slice(1)
      const exists = Object.hasOwn(env.vars, varName)
      result.push({
        text: match[0],
        fg: exists ? theme.primary : theme.error,
      })
      lastIndex = match.index + match[0].length
    }

    if (lastIndex < part.text.length) {
      result.push({
        text: part.text.slice(lastIndex),
        fg: part.fg,
        kind: part.kind,
      })
    }
  }

  return result
}

export function VirtualizedBodyViewer({
  body,
  theme,
  activeEnv,
  backgroundColor,
  scrollRef,
}: {
  body: string
  theme: Theme
  activeEnv?: Environment | null
  backgroundColor?: string
  scrollRef?: RefObject<ScrollBoxRenderable | null>
}) {
  const lines = useMemo(() => viewerLines(body), [body])
  const tokens = useMemo(
    () =>
      body.length > LARGE_BODY_BYTES ? highlightJsonTokens(body, theme) : null,
    [body, theme],
  )
  const totalLines = lines.length
  const [scrollTop, setScrollTop] = useState(0)

  useEffect(() => {
    setScrollTop(0)
    if (scrollRef?.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [body, scrollRef])

  useEffect(() => {
    const checkScroll = () => {
      const sb = scrollRef?.current
      if (sb) {
        const top = Math.max(0, Math.floor(sb.scrollTop))
        setScrollTop((prev) => (prev !== top ? top : prev))
      }
    }
    checkScroll()
    const intervalId = setInterval(checkScroll, 16)
    return () => {
      clearInterval(intervalId)
    }
  }, [scrollRef])

  const bg = backgroundColor ?? theme.backgroundPanel
  const maxDigits = Math.max(3, String(totalLines).length)

  const startIdx = Math.max(0, scrollTop)
  const endIdx = Math.min(totalLines, scrollTop + VIEWPORT_HEIGHT)
  const visibleLines = lines.slice(startIdx, endIdx)

  return (
    <box
      style={{
        height: totalLines,
        width: "100%",
        flexDirection: "column",
        backgroundColor: bg,
      }}
    >
      <box
        style={{
          height: scrollTop,
          flexShrink: 0,
        }}
      />
      <box style={{ flexDirection: "column" }}>
        {visibleLines.map((line, offset) => {
          const lineNum = startIdx + offset + 1
          const cleanLine = line.text.endsWith("\r")
            ? line.text.slice(0, -1)
            : line.text
          let parts = tokens
            ? tokenPartsForRange(
                body,
                tokens,
                line.offset,
                line.offset + cleanLine.length,
                theme,
              )
            : tokenizeLine(cleanLine, theme)
          if (activeEnv) {
            parts = highlightEnvVarsInParts(parts, activeEnv, theme)
          }

          return (
            <box key={lineNum} style={{ flexDirection: "row", height: 1 }}>
              <text fg={theme.textMuted} bg={bg}>
                {String(lineNum).padStart(maxDigits, " ")}{" "}
              </text>
              <box style={{ flexDirection: "row", flexGrow: 1 }}>
                {parts.length === 0 ? (
                  <text fg={theme.text} bg={bg}>
                    {" "}
                  </text>
                ) : (
                  parts.map((part, pIdx) => (
                    <text key={pIdx} fg={part.fg} bg={bg}>
                      {part.text}
                    </text>
                  ))
                )}
              </box>
            </box>
          )
        })}
      </box>
    </box>
  )
}

export function JsonBodyViewer({
  body,
  theme,
  id,
  readOnly = false,
  activeEnv,
  backgroundColor,
  scrollRef,
}: {
  body: string
  theme: Theme
  id?: string
  readOnly?: boolean
  activeEnv?: Environment | null
  backgroundColor?: string
  focused?: boolean
  scrollRef?: RefObject<ScrollBoxRenderable | null>
}) {
  const lineCount = useMemo(() => {
    let count = 1
    for (let i = 0; i < body.length; i++) {
      if (body.charCodeAt(i) === 10) count++
    }
    return count
  }, [body])

  const ref = useRef<TextareaRenderable | null>(null)

  useEffect(() => {
    const ta = ref.current
    if (ta) {
      if (readOnly) {
        ta.focusable = false
      }
      return highlightTextarea(ta, body, theme, activeEnv ?? null)
    }
  }, [body, theme, readOnly, activeEnv])

  if (readOnly || lineCount > 150 || body.length > LARGE_BODY_BYTES) {
    return (
      <VirtualizedBodyViewer
        body={body}
        theme={theme}
        activeEnv={activeEnv}
        backgroundColor={backgroundColor}
        scrollRef={scrollRef}
      />
    )
  }

  const bg = backgroundColor ?? theme.backgroundPanel

  return (
    <line-number
      minWidth={3}
      paddingRight={1}
      fg={theme.textMuted}
      bg={bg}
      style={{ flexGrow: 1 }}
      width="100%"
    >
      <textarea
        ref={ref}
        id={id}
        initialValue={body}
        backgroundColor={bg}
        textColor={theme.text}
        style={{ flexGrow: 1 }}
      />
    </line-number>
  )
}
