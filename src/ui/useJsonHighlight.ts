import { useCallback, useEffect, useRef, useState } from "react"
import { SyntaxStyle } from "@opentui/core"
import type { TextareaRenderable, LineNumberRenderable } from "@opentui/core"
import type { Theme } from "./theme-data"
import { highlightJsonTokens } from "./syntax"

export interface JsonValidation {
  valid: boolean
  error?: {
    message: string
    line: number
    column: number
  }
}

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

export function parseJsonError(
  content: string,
): { valid: true } | { valid: false; error: NonNullable<JsonValidation["error"]> } {
  try {
    JSON.parse(content)
    return { valid: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid JSON"
    let line = 0
    let column = 0
    const posMatch = /position\s+(\d+)/i.exec(message)
    if (posMatch) {
      const pos = parseInt(posMatch[1]!, 10)
      const before = content.slice(0, pos)
      line = (before.match(/\n/g) ?? []).length
      const lastNewline = before.lastIndexOf("\n")
      column = lastNewline === -1 ? pos : pos - lastNewline - 1
    }
    return { valid: false, error: { message, line, column } }
  }
}

function applyHighlightsAndValidate(
  textarea: TextareaRenderable,
  lineNumber: LineNumberRenderable | null,
  content: string,
  theme: Theme,
  syntaxStyle: SyntaxStyle,
  onValidation: (v: JsonValidation) => void,
  prevErrorLine: { current: number | null },
): void {
  const result = parseJsonError(content)
  if (!result.valid) {
    try {
      textarea.clearAllHighlights()
    } catch {
      // highlight clear failed, continue
    }
    if (prevErrorLine.current !== null && lineNumber) {
      try {
        lineNumber.clearLineSign(prevErrorLine.current)
        lineNumber.clearLineColor(prevErrorLine.current)
      } catch {
        // line decoration clear failed, continue
      }
    }
    if (lineNumber) {
      try {
        lineNumber.setLineSign(result.error.line, {
          before: "✗",
          beforeColor: theme.error,
        })
        lineNumber.setLineColor(result.error.line, { content: theme.error })
      } catch {
        // line decoration set failed, continue
      }
    }
    prevErrorLine.current = result.error.line
    onValidation({ valid: false, error: result.error })
    return
  }

  if (prevErrorLine.current !== null && lineNumber) {
    try {
      lineNumber.clearLineSign(prevErrorLine.current)
      lineNumber.clearLineColor(prevErrorLine.current)
    } catch {
      // line decoration clear failed, continue
    }
    prevErrorLine.current = null
  }
  onValidation({ valid: true })

  if (content.length > 100_000) return

  const tokens = highlightJsonTokens(content, theme)
  if (tokens.length === 0) return

  try {
    textarea.clearAllHighlights()
    textarea.syntaxStyle = syntaxStyle
    for (const token of tokens) {
      const styleId = styleIdForFg(token.fg, theme, syntaxStyle)
      textarea.addHighlightByCharRange({
        start: token.offset,
        end: token.offset + token.text.length,
        styleId,
        priority: 1,
      })
    }
  } catch {
    // highlight application failed, textarea remains editable
  }
}

const DEBOUNCE_MS = 150

export function useJsonHighlight(
  textareaRef: { current: TextareaRenderable | null },
  lineNumberRef: { current: LineNumberRenderable | null },
  theme: Theme,
  setEditValue: (v: string) => void,
): {
  validation: JsonValidation
  handleContentChange: () => void
} {
  const [validation, setValidation] = useState<JsonValidation>({ valid: true })
  const timeoutRef = useRef<Timer | null>(null)
  const syntaxStyleRef = useRef<SyntaxStyle | null>(null)
  const prevErrorLine = useRef<number | null>(null)

  if (!syntaxStyleRef.current) {
    syntaxStyleRef.current = createJsonSyntaxStyle(theme)
  }

  const handleContentChange = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    setEditValue(textarea.plainText)

    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      const currentContent = textarea.plainText
      applyHighlightsAndValidate(
        textarea,
        lineNumberRef.current,
        currentContent,
        theme,
        syntaxStyleRef.current!,
        setValidation,
        prevErrorLine,
      )
    }, DEBOUNCE_MS)
  }, [textareaRef, lineNumberRef, theme, setEditValue])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      syntaxStyleRef.current?.destroy()
      syntaxStyleRef.current = null
      textareaRef.current?.clearAllHighlights()
      if (lineNumberRef.current && prevErrorLine.current !== null) {
        lineNumberRef.current.clearLineSign(prevErrorLine.current)
        lineNumberRef.current.clearLineColor(prevErrorLine.current)
      }
    }
  }, [])

  return { validation, handleContentChange }
}
