import type { Theme } from "../theme-data"

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

export function tokenizeLine(line: string, theme: Theme): SpanPart[] {
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
  return formatted.split("\n").map((line) => {
    const cleanLine = line.endsWith("\r") ? line.slice(0, -1) : line
    return tokenizeLine(cleanLine, theme)
  })
}

export function highlightJsonTokens(
  formatted: string,
  theme: Theme,
): JsonToken[] {
  const tokens: JsonToken[] = []
  if (formatted.trim() === "") return tokens
  const isWhitespace = (char: string) => /\s/.test(char)
  const literalRe = /(?:true|false|null)(?!\w)/y
  const numberRe = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?(?![\w.])/y

  for (let offset = 0; offset < formatted.length;) {
    const char = formatted[offset]!
    if (char === "\n" || char === "\r") {
      offset++
      continue
    }

    if (isWhitespace(char)) {
      const start = offset
      while (
        offset < formatted.length &&
        isWhitespace(formatted[offset]!) &&
        formatted[offset] !== "\n" &&
        formatted[offset] !== "\r"
      ) {
        offset++
      }
      tokens.push({
        text: formatted.slice(start, offset),
        fg: theme.text,
        offset: start,
        kind: "text",
      })
      continue
    }

    if (char === "," || char === ":") {
      tokens.push({ text: char, fg: theme.textMuted, offset, kind: "bracket" })
      offset++
      continue
    }

    if ("{}[]".includes(char)) {
      tokens.push({ text: char, fg: theme.textMuted, offset, kind: "bracket" })
      offset++
      continue
    }

    if (char === '"') {
      const start = offset
      offset++
      while (offset < formatted.length) {
        if (formatted[offset] === "\\") {
          offset += 2
          continue
        }
        if (formatted[offset] === '"') {
          offset++
          break
        }
        offset++
      }
      let next = offset
      while (next < formatted.length && isWhitespace(formatted[next]!)) next++
      tokens.push({
        text: formatted.slice(start, offset),
        fg:
          next < formatted.length && formatted[next] === ":"
            ? theme.secondary
            : theme.success,
        offset: start,
        kind:
          next < formatted.length && formatted[next] === ":" ? "key" : "string",
      })
      continue
    }

    literalRe.lastIndex = offset
    const literal = literalRe.exec(formatted)
    if (literal) {
      const text = literal[0]
      tokens.push({
        text,
        fg: theme.info,
        offset,
        kind: text === "null" ? "null" : "boolean",
      })
      offset += text.length
      continue
    }

    numberRe.lastIndex = offset
    const number = numberRe.exec(formatted)
    if (number) {
      tokens.push({
        text: number[0],
        fg: theme.warning,
        offset,
        kind: "number",
      })
      offset += number[0].length
      continue
    }

    const start = offset
    while (
      offset < formatted.length &&
      !isWhitespace(formatted[offset]!) &&
      !'{}[],:"'.includes(formatted[offset]!)
    ) {
      offset++
    }
    tokens.push({
      text: formatted.slice(start, offset),
      fg: theme.text,
      offset: start,
      kind: "text",
    })
  }

  return tokens
}
