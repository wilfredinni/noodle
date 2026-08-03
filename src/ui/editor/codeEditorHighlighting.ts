import type { Highlight, SimpleHighlight, SyntaxStyle } from "@opentui/core"
import type { Theme } from "../theme-data"
import {
  buildCharToDisplayOffsets,
  charOffsetToDisplayOffset,
} from "../variable-completion/highlightOffsets"
import { highlightJsonTokens } from "./syntax"
import { tokenizeYamlLine } from "./yamlSyntax"
import {
  buildByteToDisplayOffsets,
  byteOffsetToDisplayOffset,
} from "./codeEditorOffsets"
import {
  styleIdForJsonToken,
  styleIdForYamlForeground,
} from "./codeEditorStyles"

export interface EditorHighlightRange {
  start: number
  end: number
  styleId: number
  priority: number
}

export function buildTreeSitterHighlightRanges(
  highlights: SimpleHighlight[],
  content: string,
  style: SyntaxStyle,
): EditorHighlightRange[] {
  const displayOffsets = buildByteToDisplayOffsets(content)
  return highlights.flatMap(([start, end, group]) => {
    if (start >= end) return []
    const styleId = style.getStyleId(group)
    if (styleId === null) return []
    return [
      {
        start: byteOffsetToDisplayOffset(displayOffsets, start),
        end: byteOffsetToDisplayOffset(displayOffsets, end),
        styleId,
        priority: 1,
      },
    ]
  })
}

export function buildJsonHighlightRanges(
  content: string,
  theme: Theme,
  style: SyntaxStyle,
): EditorHighlightRange[] {
  return highlightJsonTokens(content, theme).map((token) => ({
    start: token.displayOffset,
    end: token.displayEnd,
    styleId: styleIdForJsonToken(token.kind, token.fg, theme, style),
    priority: 1,
  }))
}

export function buildYamlHighlightRanges(
  content: string,
  theme: Theme,
  style: SyntaxStyle,
): EditorHighlightRange[] {
  const ranges: EditorHighlightRange[] = []
  const displayOffsets = buildCharToDisplayOffsets(content)
  let sourceOffset = 0

  for (const line of content.split("\n")) {
    const cleanLine = line.endsWith("\r") ? line.slice(0, -1) : line
    let lineOffset = 0
    for (const span of tokenizeYamlLine(cleanLine, theme)) {
      if (span.text.length === 0) continue
      ranges.push({
        start: charOffsetToDisplayOffset(
          displayOffsets,
          sourceOffset + lineOffset,
        ),
        end: charOffsetToDisplayOffset(
          displayOffsets,
          sourceOffset + lineOffset + span.text.length,
        ),
        styleId: styleIdForYamlForeground(span.fg, theme, style),
        priority: 1,
      })
      lineOffset += span.text.length
    }
    sourceOffset += line.length + 1
  }

  return ranges
}

export function buildExtraHighlightRanges(
  content: string,
  highlights: Highlight[],
): EditorHighlightRange[] {
  const displayOffsets = buildCharToDisplayOffsets(content)
  return highlights.map((highlight) => ({
    start: charOffsetToDisplayOffset(displayOffsets, highlight.start),
    end: charOffsetToDisplayOffset(displayOffsets, highlight.end),
    styleId: highlight.styleId,
    priority: highlight.priority ?? 2,
  }))
}
