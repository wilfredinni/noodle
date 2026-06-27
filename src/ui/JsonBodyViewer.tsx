import { useEffect, useRef } from "react"
import type { TextareaRenderable } from "@opentui/core"
import type { Theme } from "./theme-data"
import { highlightTextarea } from "./useJsonHighlight"

export function JsonBodyViewer({
  body,
  theme,
  id,
  readOnly = false,
}: {
  body: string
  theme: Theme
  id?: string
  readOnly?: boolean
}) {
  const ref = useRef<TextareaRenderable | null>(null)

  useEffect(() => {
    const ta = ref.current
    if (ta) {
      highlightTextarea(ta, body, theme)
      if (readOnly) {
        ta.focusable = false
      }
    }
  }, [body, theme, readOnly])

  return (
    <line-number
      minWidth={3}
      paddingRight={1}
      fg={theme.textMuted}
      bg={theme.backgroundPanel}
      style={{ flexGrow: 1 }}
      width="100%"
    >
      <textarea
        ref={ref}
        id={id}
        initialValue={body}
        backgroundColor={theme.backgroundPanel}
        textColor={theme.text}
      />
    </line-number>
  )
}
