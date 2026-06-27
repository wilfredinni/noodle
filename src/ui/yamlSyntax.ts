import type { Theme } from "./theme-data"
import { SyntaxStyle } from "@opentui/core"
import type { TextareaRenderable } from "@opentui/core"

export function createYamlSyntaxStyle(theme: Theme): SyntaxStyle {
  return SyntaxStyle.fromStyles({
    "yaml.key": { fg: theme.secondary },
    "yaml.string": { fg: theme.success },
    "yaml.number": { fg: theme.warning },
    "yaml.boolean": { fg: theme.info },
    "yaml.null": { fg: theme.info },
    "yaml.punctuation": { fg: theme.textMuted },
    "yaml.comment": { fg: theme.textMuted },
    "yaml.text": { fg: theme.text },
  })
}

function styleIdForFg(fg: string, theme: Theme, style: SyntaxStyle): number {
  if (fg === theme.secondary) return style.getStyleId("yaml.key") ?? 0
  if (fg === theme.success) return style.getStyleId("yaml.string") ?? 0
  if (fg === theme.warning) return style.getStyleId("yaml.number") ?? 0
  if (fg === theme.info) return style.getStyleId("yaml.boolean") ?? 0
  if (fg === theme.textMuted) return style.getStyleId("yaml.comment") ?? 0
  return style.getStyleId("yaml.text") ?? 0
}

interface Span {
  text: string
  fg: string
}

function tokenizeYamlLine(line: string, theme: Theme): Span[] {
  const trimmed = line.trimStart()
  const indent = line.slice(0, line.length - trimmed.length)

  if (trimmed === "") return []

  // Comment
  if (trimmed.startsWith("#")) {
    return [{ text: line, fg: theme.textMuted }]
  }

  const parts: Span[] = []
  if (indent) parts.push({ text: indent, fg: theme.textMuted })

  // List item
  if (trimmed.startsWith("- ")) {
    parts.push({ text: "-", fg: theme.textMuted })
    const rest = " " + trimmed.slice(2)
    const inner = tokenizeInline(rest, theme)
    parts.push(...inner)
    return parts
  }

  // Key: value
  const colonIdx = findFirstColon(trimmed)
  if (colonIdx >= 0) {
    const key = trimmed.slice(0, colonIdx)
    const afterColon = trimmed.slice(colonIdx + 1)
    parts.push({ text: key + ":", fg: theme.secondary })
    if (afterColon) {
      const inner = tokenizeInline(afterColon, theme)
      parts.push(...inner)
    }
    return parts
  }

  // Plain scalar
  const inner = tokenizeInline(trimmed, theme)
  return [...parts, ...inner]
}

function findFirstColon(s: string): number {
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === "'" && !inDouble) inSingle = !inSingle
    else if (ch === '"' && !inSingle) inDouble = !inDouble
    else if (ch === ":" && !inSingle && !inDouble) return i
  }
  return -1
}

function tokenizeInline(raw: string, theme: Theme): Span[] {
  const s = raw

  // Leading colon + space for key:
  if (s.startsWith(": ")) {
    return [{ text: s, fg: theme.secondary }]
  }

  // Quoted string
  if (s.startsWith('"') || s.startsWith("'")) {
    const close = findClosingQuote(s)
    if (close >= 0) {
      return [{ text: s.slice(0, close + 1), fg: theme.success }]
    }
    return [{ text: s, fg: theme.text }]
  }

  // Trim trailing comment
  const commentIdx = findCommentIndex(s)
  let value = s
  let comment = ""
  if (commentIdx >= 0) {
    value = s.slice(0, commentIdx)
    comment = s.slice(commentIdx)
  }

  const trimmed = value.trimStart()
  const space = value.slice(0, value.length - trimmed.length)

  const parts: Span[] = []
  if (space) parts.push({ text: space, fg: theme.text })

  if (trimmed === "") {
    if (comment) parts.push({ text: comment, fg: theme.textMuted })
    return parts
  }

  if (
    /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(trimmed) &&
    !trimmed.startsWith("0x")
  ) {
    parts.push({ text: trimmed, fg: theme.warning })
  } else if (/^(true|false|yes|no|on|off)$/i.test(trimmed)) {
    parts.push({ text: trimmed, fg: theme.info })
  } else if (/^(null|~)$/i.test(trimmed)) {
    parts.push({ text: trimmed, fg: theme.info })
  } else {
    parts.push({ text: trimmed, fg: theme.text })
  }

  if (comment) parts.push({ text: comment, fg: theme.textMuted })

  return parts
}

function findClosingQuote(s: string): number {
  const quote = s[0]
  for (let i = 1; i < s.length; i++) {
    if (s[i] === "\\") {
      i++
      continue
    }
    if (s[i] === quote) return i
  }
  return -1
}

function findCommentIndex(s: string): number {
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === "'" && !inDouble) inSingle = !inSingle
    else if (ch === '"' && !inSingle) inDouble = !inDouble
    else if (ch === "#" && !inSingle && !inDouble) {
      if (i > 0 && s[i - 1] === " ") return i
    }
  }
  return -1
}

export function highlightYaml(
  textarea: TextareaRenderable,
  content: string,
  theme: Theme,
): void {
  if (content.length > 100_000) return
  const style = createYamlSyntaxStyle(theme)
  textarea.clearAllHighlights()
  textarea.syntaxStyle = style

  let offset = 0
  const lines = content.split("\n")

  for (let i = 0; i < lines.length; i++) {
    const spans = tokenizeYamlLine(lines[i], theme)
    for (const span of spans) {
      if (span.text.length > 0) {
        const styleId = styleIdForFg(span.fg, theme, style)
        textarea.addHighlightByCharRange({
          start: offset,
          end: offset + span.text.length,
          styleId,
          priority: 1,
        })
        offset += span.text.length
      }
    }
    // newline has no character position in addHighlightByCharRange
  }
}
