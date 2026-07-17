import type { Theme } from "../theme"

export interface CodeSpan {
  text: string
  fg: string
}

const KEYWORDS = new Set([
  "async",
  "await",
  "const",
  "def",
  "else",
  "False",
  "for",
  "func",
  "function",
  "if",
  "import",
  "in",
  "let",
  "new",
  "nil",
  "None",
  "package",
  "return",
  "True",
  "var",
])

/** A compact highlighter for generated snippets, without shipping extra parsers. */
export function highlightGeneratedCode(
  code: string,
  theme: Theme,
): CodeSpan[][] {
  return code.split("\n").map((line) => highlightLine(line, theme))
}

function highlightLine(line: string, theme: Theme): CodeSpan[] {
  const spans: CodeSpan[] = []
  const tokenPattern =
    /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/.*$|#.*$|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b)/g
  let cursor = 0

  for (const match of line.matchAll(tokenPattern)) {
    const index = match.index ?? 0
    if (index > cursor)
      spans.push({ text: line.slice(cursor, index), fg: theme.text })
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

  if (cursor < line.length || spans.length === 0)
    spans.push({ text: line.slice(cursor), fg: theme.text })
  return spans
}
