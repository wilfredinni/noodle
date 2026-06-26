import { useCallback, useEffect, useRef, useState } from "react"
import { SyntaxStyle } from "@opentui/core"
import type { TextareaRenderable, LineNumberRenderable } from "@opentui/core"
import type { Theme } from "./theme-data"
import { highlightJsonTokens } from "./syntax"

function createJsonSyntaxStyle(theme: Theme): SyntaxStyle {
  return SyntaxStyle.fromStyles({
    "json.key": { fg: theme.secondary },
    "json.string": { fg: theme.success },
    "json.number": { fg: theme.warning },
    "json.boolean": { fg: theme.info },
    "json.null": { fg: theme.info },
    "json.bracket": { fg: theme.textMuted },
    "json.text": { fg: theme.text },
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
  const syntaxStyleRef = useRef<SyntaxStyle | null>(null)

  if (!syntaxStyleRef.current) {
    try {
      syntaxStyleRef.current = createJsonSyntaxStyle(theme)
    } catch {
      // SyntaxStyle creation failed, no highlights
    }
  }

  const handleContentChange = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      const content = textarea.plainText
      setEditValue(content)

      const style = syntaxStyleRef.current
      if (!style || content.length > 100_000) return

      try {
        JSON.parse(content)
      } catch {
        return
      }

      try {
        textarea.clearAllHighlights()
        textarea.syntaxStyle = style
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
      } catch {
        // highlight failed, editor remains usable
      }
    }, DEBOUNCE_MS)
  }, [textareaRef, theme, setEditValue])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      syntaxStyleRef.current?.destroy()
      syntaxStyleRef.current = null
    }
  }, [])

  return { validation: { valid: true }, handleContentChange }
}
