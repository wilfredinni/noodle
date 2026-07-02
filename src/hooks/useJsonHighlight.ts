import { useCallback, useEffect, useRef } from "react"
import { SyntaxStyle } from "@opentui/core"
import type { TextareaRenderable, LineNumberRenderable } from "@opentui/core"
import type { Theme } from "../ui/theme-data"
import { highlightJsonTokens } from "../ui/syntax"
import type { Environment } from "../schema"

function createJsonSyntaxStyle(theme: Theme): SyntaxStyle {
  return SyntaxStyle.fromStyles({
    "json.key": { fg: theme.secondary },
    "json.string": { fg: theme.success },
    "json.number": { fg: theme.warning },
    "json.boolean": { fg: theme.info },
    "json.null": { fg: theme.info },
    "json.bracket": { fg: theme.textMuted },
    "json.text": { fg: theme.text },
    "env.resolved": { fg: theme.primary },
    "env.missing": { fg: theme.error },
  })
}

function styleIdForFg(fg: string, theme: Theme, style: SyntaxStyle): number {
  if (fg === theme.secondary) return style.getStyleId("json.key") ?? 0
  if (fg === theme.success) return style.getStyleId("json.string") ?? 0
  if (fg === theme.warning) return style.getStyleId("json.number") ?? 0
  if (fg === theme.info) return style.getStyleId("json.boolean") ?? 0
  if (fg === theme.textMuted) return style.getStyleId("json.bracket") ?? 0
  return style.getStyleId("json.text") ?? 0
}

export function highlightTextarea(
  textarea: TextareaRenderable,
  content: string,
  theme: Theme,
  env?: Environment | null,
): void {
  const style = createJsonSyntaxStyle(theme)
  textarea.clearAllHighlights()
  textarea.syntaxStyle = style

  try {
    JSON.parse(content)
    if (content.length <= 100_000) {
      const tokens = highlightJsonTokens(content, theme)
      for (const token of tokens) {
        const styleId = styleIdForFg(token.fg, theme, style)
        textarea.addHighlightByCharRange({
          start: token.offset,
          end: token.offset + token.text.length,
          styleId,
          priority: 1,
        })
      }
    }
  } catch {
    // not valid JSON — still add $var highlights below
  }

  if (env) {
    const varRe = /\$\w+/g
    let match: RegExpExecArray | null
    while ((match = varRe.exec(content)) !== null) {
      const varName = match[0].slice(1)
      const exists = varName in env.vars
      const styleId = exists
        ? style.getStyleId("env.resolved")!
        : style.getStyleId("env.missing")!
      textarea.addHighlightByCharRange({
        start: match.index,
        end: match.index + match[0].length,
        styleId,
        priority: 2,
      })
    }
  }
}

export interface JsonValidation {
  valid: boolean
}

const DEBOUNCE_MS = 150

export function useJsonHighlight(
  textareaRef: { current: TextareaRenderable | null },
  _lineNumberRef: { current: LineNumberRenderable | null },
  theme: Theme,
  setEditValue: (v: string) => void,
): {
  validation: JsonValidation
  handleContentChange: () => void
} {
  const timeoutRef = useRef<Timer | null>(null)

  const handleContentChange = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      const ta = textareaRef.current
      if (!ta) return
      const content = ta.plainText
      setEditValue(content)
      highlightTextarea(ta, content, theme)
    }, DEBOUNCE_MS)
  }, [textareaRef, theme, setEditValue])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  return { validation: { valid: true }, handleContentChange }
}
