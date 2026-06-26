import type { Theme } from "./theme-data"

export interface SpanPart {
  text: string
  fg: string
}

export type HighlightedLine = SpanPart[]

export interface JsonToken {
  text: string
  fg: string
  offset: number
}

function tokenizeLine(line: string, theme: Theme): SpanPart[] {
  if (line.trim() === "") return []

  if (/^\s*(\[|\]|\{|\})\s*,?\s*$/.test(line)) {
    return [{ text: line, fg: theme.textMuted }]
  }

  const keyMatch = /^(\s*)("[^"]+"\s*:\s*)(.+)/.exec(line)
  if (keyMatch) {
    const [, indent, keyPart, rest] = keyMatch
    const parts: SpanPart[] = []

    if (indent) parts.push({ text: indent, fg: theme.textMuted })
    parts.push({ text: keyPart, fg: theme.secondary })

    const trimmed = rest.replace(/,$/, "")
    const comma = rest.endsWith(",") ? "," : ""

    if (/^"[^"]*"$/.test(trimmed)) {
      parts.push({ text: trimmed, fg: theme.success })
    } else if (/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(trimmed)) {
      parts.push({ text: trimmed, fg: theme.warning })
    } else if (/^(true|false)$/.test(trimmed)) {
      parts.push({ text: trimmed, fg: theme.info })
    } else if (trimmed === "null") {
      parts.push({ text: trimmed, fg: theme.info })
    } else if (/^(\[|\{).+(\]|\})$/.test(trimmed)) {
      parts.push({ text: trimmed, fg: theme.textMuted })
    } else {
      parts.push({ text: trimmed, fg: theme.text })
    }

    if (comma) parts.push({ text: comma, fg: theme.textMuted })

    return parts
  }

  const trimmed = line.trim()
  if (/^"[^"]*",?$/.test(trimmed)) {
    const comma = trimmed.endsWith(",") ? "," : ""
    const value = comma ? trimmed.slice(0, -1) : trimmed
    return [
      { text: line.slice(0, line.indexOf(trimmed)), fg: theme.textMuted },
      { text: value, fg: theme.success },
      ...(comma ? [{ text: comma, fg: theme.textMuted }] : []),
    ]
  }
  if (/^-?\d+(\.\d+)?(e[+-]?\d+)?,?$/i.test(trimmed)) {
    return [{ text: line, fg: theme.warning }]
  }
  if (/^(true|false|null),?$/.test(trimmed)) {
    return [{ text: line, fg: theme.info }]
  }

  return [{ text: line, fg: theme.text }]
}

export function highlightJson(
  formatted: string,
  theme: Theme,
): HighlightedLine[] {
  return formatted.split("\n").map((line) => tokenizeLine(line, theme))
}

export function highlightJsonTokens(
  formatted: string,
  theme: Theme,
): JsonToken[] {
  const tokens: JsonToken[] = []
  const lines = formatted.split("\n")
  let offset = 0

  for (let i = 0; i < lines.length; i++) {
    const parts = tokenizeLine(lines[i], theme)
    for (const part of parts) {
      if (part.text.length > 0) {
        tokens.push({
          text: part.text,
          fg: part.fg,
          offset,
        })
        offset += part.text.length
      }
    }
    if (i < lines.length - 1) {
      offset += 1
    }
  }

  return tokens
}
