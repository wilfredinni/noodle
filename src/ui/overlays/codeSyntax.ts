import { RGBA, StyledText } from "@opentui/core"
import type { TextChunk } from "@opentui/core"
import type { Theme } from "../theme"

const KEYWORDS = new Set([
  "abstract",
  "and",
  "as",
  "async",
  "await",
  "begin",
  "break",
  "case",
  "catch",
  "chan",
  "class",
  "const",
  "continue",
  "defer",
  "delete",
  "do",
  "echo",
  "elif",
  "else",
  "elsif",
  "end",
  "ensure",
  "enum",
  "err",
  "except",
  "export",
  "extends",
  "extern",
  "False",
  "false",
  "finally",
  "fn",
  "for",
  "from",
  "func",
  "function",
  "go",
  "guard",
  "if",
  "impl",
  "implements",
  "import",
  "in",
  "interface",
  "is",
  "lambda",
  "let",
  "loop",
  "match",
  "mod",
  "module",
  "mut",
  "new",
  "nil",
  "None",
  "not",
  "null",
  "of",
  "Ok",
  "or",
  "package",
  "pass",
  "private",
  "protected",
  "pub",
  "public",
  "raise",
  "range",
  "require",
  "rescue",
  "return",
  "self",
  "static",
  "struct",
  "super",
  "switch",
  "then",
  "this",
  "throw",
  "trait",
  "True",
  "true",
  "try",
  "type",
  "typeof",
  "undefined",
  "unless",
  "use",
  "var",
  "void",
  "when",
  "while",
  "with",
  "yield",
])

const HASH_COMMENT_TARGETS = new Set(["python", "ruby", "shell", "php"])

const colorCache = new Map<string, RGBA>()

function toRGBA(hex: string): RGBA {
  const cached = colorCache.get(hex)
  if (cached) return cached
  const rgba = RGBA.fromHex(hex)
  colorCache.set(hex, rgba)
  return rgba
}

function chunk(text: string, color: string): TextChunk {
  return { __isChunk: true as const, text, fg: toRGBA(color) }
}

function tokenizeSegment(
  segment: string,
  chunks: TextChunk[],
  theme: Theme,
  hashComments?: boolean,
): void {
  const tokenPattern = hashComments
    ? /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|#.*$|\/\/.*$|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b)/g
    : /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/.*$|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b)/g
  let cursor = 0

  for (const match of segment.matchAll(tokenPattern)) {
    const index = match.index!
    if (index > cursor)
      chunks.push(chunk(segment.slice(cursor, index), theme.text))
    const text = match[0]
    const fg = text.startsWith("#")
      ? theme.textMuted
      : text.startsWith("//")
        ? theme.textMuted
        : text.startsWith('"') || text.startsWith("'") || text.startsWith("`")
          ? theme.success
          : /^\d/.test(text)
            ? theme.warning
            : KEYWORDS.has(text)
              ? theme.secondary
              : theme.text
    chunks.push(chunk(text, fg))
    cursor = index + text.length
  }

  if (cursor < segment.length)
    chunks.push(chunk(segment.slice(cursor), theme.text))
}

export function highlightGeneratedCode(
  code: string,
  theme: Theme,
  target?: string,
): StyledText[] {
  const hashComments = target != null ? HASH_COMMENT_TARGETS.has(target) : false
  const lines = code.split("\n")
  let inTripleQuote: "none" | "double" | "single" = "none"

  return lines.map((line) => {
    const chunks: TextChunk[] = []
    let cursor = 0

    if (inTripleQuote !== "none") {
      const closing = inTripleQuote === "double" ? '"""' : "'''"
      const closeIdx = line.indexOf(closing)
      if (closeIdx !== -1) {
        const before = line.slice(cursor, closeIdx + 3)
        if (before) chunks.push(chunk(before, theme.success))
        cursor = closeIdx + 3
        inTripleQuote = "none"
      } else {
        chunks.push(chunk(line, theme.success))
        return new StyledText(chunks)
      }
    }

    if (cursor < line.length) {
      const rest = line.slice(cursor)
      const dqOpen = rest.indexOf('"""')
      const sqOpen = rest.indexOf("'''")
      let openIdx: number
      let openDelim: "double" | "single"

      if (dqOpen !== -1 && (sqOpen === -1 || dqOpen <= sqOpen)) {
        openIdx = dqOpen
        openDelim = "double"
      } else if (sqOpen !== -1) {
        openIdx = sqOpen
        openDelim = "single"
      } else {
        // no triple-quote on this line — tokenize normally
        tokenizeSegment(rest, chunks, theme, hashComments)
        return new StyledText(chunks)
      }

      const before = rest.slice(0, openIdx)
      if (before) tokenizeSegment(before, chunks, theme, hashComments)

      const fromOpen = rest.slice(openIdx)
      const closing = openDelim === "double" ? '"""' : "'''"
      const closeIdx = fromOpen.indexOf(closing, 3)

      if (closeIdx !== -1) {
        const inDoc = fromOpen.slice(0, closeIdx + 3)
        if (inDoc) chunks.push(chunk(inDoc, theme.success))
        const after = fromOpen.slice(closeIdx + 3)
        if (after) tokenizeSegment(after, chunks, theme, hashComments)
      } else {
        chunks.push(chunk(fromOpen, theme.success))
        inTripleQuote = openDelim
      }
    }

    return new StyledText(chunks)
  })
}
