import type { Theme } from "../theme"

export interface CodeSpan {
  text: string
  fg: string
}

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
): CodeSpan[][] {
  return code.split("\n").map((line) => highlightLine(line, theme))
}

function highlightLine(line: string, theme: Theme): CodeSpan[] {
  const { cleaned, restore } = hideTripleQuotes(line)

  const spans: CodeSpan[] = []
  const tokenPattern =
    /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/.*$|#.*$|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b)/g
  let cursor = 0

  for (const match of cleaned.matchAll(tokenPattern)) {
    const index = match.index ?? 0
    if (index > cursor)
      spans.push({ text: cleaned.slice(cursor, index), fg: theme.text })
    const text = match[0]
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
    spans.push({ text, fg })
    cursor = index + text.length
  }

  if (cursor < cleaned.length || spans.length === 0)
    spans.push({ text: cleaned.slice(cursor), fg: theme.text })

  const restored = spans.map((span) => ({
    ...span,
    text: restore(span.text),
  }))

  return restored
}
