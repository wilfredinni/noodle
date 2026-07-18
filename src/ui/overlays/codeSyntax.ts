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

const TRIPLE_QUOTE_RE = /(?:"""(?:[^"\\]|\\.)*"""|'''(?:[^'\\]|\\.)*''')/g

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

function hideTripleQuotes(line: string): {
  cleaned: string
  restore: (line: string) => string
} {
  const replaced: string[] = []
  const cleaned = line.replace(TRIPLE_QUOTE_RE, (match) => {
    const idx = replaced.length
    replaced.push(match)
    return `___N_TRIPLE_${idx}___`
  })
  return {
    cleaned,
    restore: (s: string) => {
      let result = s
      for (let i = 0; i < replaced.length; i++) {
        result = result.replace(`___N_TRIPLE_${i}___`, replaced[i]!)
      }
      return result
    },
  }
}

export function highlightGeneratedCode(
  code: string,
  theme: Theme,
): StyledText[] {
  return code.split("\n").map((line) => {
    const { cleaned, restore } = hideTripleQuotes(line)
    const chunks: TextChunk[] = []
    const tokenPattern =
      /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/.*$|#.*$|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b)/g
    let cursor = 0

    for (const match of cleaned.matchAll(tokenPattern)) {
      const index = match.index ?? 0
      if (index > cursor)
        chunks.push(chunk(restore(cleaned.slice(cursor, index)), theme.text))
      const text = restore(match[0])
      const fg =
        text.startsWith("//") || text.startsWith("#")
          ? theme.textMuted
          : text.startsWith('"') || text.startsWith("'") || text.startsWith("`")
            ? theme.success
            : /^\d/.test(text)
              ? theme.warning
              : KEYWORDS.has(text)
                ? theme.secondary
                : theme.text
      chunks.push(chunk(text, fg))
      cursor = index + match[0].length
    }

    if (cursor < cleaned.length || chunks.length === 0)
      chunks.push(chunk(restore(cleaned.slice(cursor)), theme.text))

    return new StyledText(chunks)
  })
}
