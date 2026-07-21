import { SyntaxStyle } from "@opentui/core"
import type { TextareaRenderable } from "@opentui/core"
import type { Theme } from "../theme-data"
import { highlightJsonTokens } from "./syntax"
import type { Environment } from "../../schema"
import {
  buildCharToDisplayOffsets,
  charOffsetToDisplayOffset,
} from "../variable-completion/highlightOffsets"

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

function applyEnvHighlights(
  textarea: TextareaRenderable,
  content: string,
  env: Environment,
  style: SyntaxStyle,
): void {
  const varRe = /\$\w+/g
  const displayOffsets = buildCharToDisplayOffsets(content)
  let match: RegExpExecArray | null
  while ((match = varRe.exec(content)) !== null) {
    const varName = match[0].slice(1)
    const exists = Object.hasOwn(env.vars, varName)
    const styleId = exists
      ? style.getStyleId("env.resolved")!
      : style.getStyleId("env.missing")!
    textarea.addHighlightByCharRange({
      start: charOffsetToDisplayOffset(displayOffsets, match.index),
      end: charOffsetToDisplayOffset(
        displayOffsets,
        match.index + match[0].length,
      ),
      styleId,
      priority: 2,
    })
  }
}

export const MAX_HIGHLIGHT_SIZE = 10_000_000

export function highlightTextarea(
  textarea: TextareaRenderable,
  content: string,
  theme: Theme,
  env?: Environment | null,
): () => void {
  let cancelled = false

  const style = createJsonSyntaxStyle(theme)
  textarea.clearAllHighlights()
  textarea.syntaxStyle = style

  if (content.length > MAX_HIGHLIGHT_SIZE) {
    return () => {
      cancelled = true
    }
  }

  if (content.length <= 20_000) {
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
    if (env) {
      applyEnvHighlights(textarea, content, env, style)
    }
    return () => {
      cancelled = true
    }
  }

  const lines = content.split("\n")
  const CHUNK_LINES = 400

  ;(async () => {
    let lineOffset = 0
    for (let i = 0; i < lines.length; i += CHUNK_LINES) {
      if (cancelled) return

      const chunkLines = lines.slice(i, i + CHUNK_LINES)
      const chunkText = chunkLines.join("\n")
      const tokens = highlightJsonTokens(chunkText, theme)

      for (const token of tokens) {
        if (cancelled) return
        const styleId = styleIdForFg(token.fg, theme, style)
        textarea.addHighlightByCharRange({
          start: lineOffset + token.offset,
          end: lineOffset + token.offset + token.text.length,
          styleId,
          priority: 1,
        })
      }

      lineOffset += chunkText.length + 1

      // Yield to the event loop so the UI remains fluid and never freezes
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    if (!cancelled && env) {
      applyEnvHighlights(textarea, content, env, style)
    }
  })()

  return () => {
    cancelled = true
  }
}
