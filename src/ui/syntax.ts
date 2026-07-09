import type { Theme } from "./theme-data"

export interface SpanPart {
  text: string
  fg: string
  kind?: JsonToken["kind"]
}

export type HighlightedLine = SpanPart[]

export interface JsonToken {
  text: string
  fg: string
  offset: number
  kind: "key" | "string" | "number" | "boolean" | "null" | "bracket" | "text"
}

function tokenizeLine(line: string, theme: Theme): SpanPart[] {
  if (line.trim() === "") return []

  if (/^\s*(\[|\]|\{|\})\s*,?\s*$/.test(line)) {
    return [{ text: line, fg: theme.textMuted, kind: "bracket" }]
  }

  const keyMatch = /^(\s*)("[^"]+"\s*:\s*)(.+)/.exec(line)
  if (keyMatch) {
    const [, indent, keyPart, rest] = keyMatch
    const parts: SpanPart[] = []

    if (indent) parts.push({ text: indent, fg: theme.textMuted, kind: "text" })
    parts.push({ text: keyPart, fg: theme.secondary, kind: "key" })

    const trimmed = rest.replace(/,$/, "")
    const comma = rest.endsWith(",") ? "," : ""

    if (/^"[^"]*"$/.test(trimmed)) {
      parts.push({ text: trimmed, fg: theme.success, kind: "string" })
    } else if (/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(trimmed)) {
      parts.push({ text: trimmed, fg: theme.warning, kind: "number" })
    } else if (/^(true|false)$/.test(trimmed)) {
      parts.push({ text: trimmed, fg: theme.info, kind: "boolean" })
    } else if (trimmed === "null") {
      parts.push({ text: trimmed, fg: theme.info, kind: "null" })
    } else if (/^(\[|\{).+(\]|\})$/.test(trimmed)) {
      parts.push({ text: trimmed, fg: theme.textMuted, kind: "bracket" })
    } else {
      parts.push({ text: trimmed, fg: theme.text, kind: "text" })
    }

    if (comma) parts.push({ text: comma, fg: theme.textMuted, kind: "bracket" })

    return parts
  }

  const trimmed = line.trim()
  if (/^"[^"]*",?$/.test(trimmed)) {
    const comma = trimmed.endsWith(",") ? "," : ""
    const value = comma ? trimmed.slice(0, -1) : trimmed
    return [
      {
        text: line.slice(0, line.indexOf(trimmed)),
        fg: theme.textMuted,
        kind: "text",
      },
      { text: value, fg: theme.success, kind: "string" },
      ...(comma
        ? ([
            { text: comma, fg: theme.textMuted, kind: "bracket" },
          ] as SpanPart[])
        : []),
    ]
  }
  if (/^-?\d+(\.\d+)?(e[+-]?\d+)?,?$/i.test(trimmed)) {
    return [{ text: line, fg: theme.warning, kind: "number" }]
  }
  if (/^(true|false|null),?$/.test(trimmed)) {
    return [
      (() => {
        const kind: JsonToken["kind"] = trimmed.startsWith("null")
          ? "null"
          : "boolean"
        return {
          text: line,
          fg: theme.info,
          kind,
        }
      })(),
    ]
  }

  return [{ text: line, fg: theme.text, kind: "text" }]
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
          kind:
            part.kind ??
            (part.fg === theme.secondary
              ? "key"
              : part.fg === theme.success
                ? "string"
                : part.fg === theme.warning
                  ? "number"
                  : part.fg === theme.info
                    ? "boolean"
                    : part.fg === theme.textMuted
                      ? "bracket"
                      : "text"),
        })
        offset += part.text.length
      }
    }
    // newline has no character position in addHighlightByCharRange
  }

  return tokens
}
