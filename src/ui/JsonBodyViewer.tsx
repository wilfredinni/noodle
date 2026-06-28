import { useEffect, useRef } from "react"
import type { TextareaRenderable } from "@opentui/core"
import type { Theme } from "./theme-data"
import { highlightTextarea } from "../hooks/useJsonHighlight"
import type { Environment } from "../schema"

export function JsonBodyViewer({
  body,
  theme,
  id,
  readOnly = false,
  activeEnv,
}: {
  body: string
  theme: Theme
  id?: string
  readOnly?: boolean
  activeEnv?: Environment | null
}) {
  const ref = useRef<TextareaRenderable | null>(null)

  useEffect(() => {
    const ta = ref.current
    if (ta) {
      highlightTextarea(ta, body, theme, activeEnv ?? null)
      if (readOnly) {
        ta.focusable = false
      }
    }
  }, [body, theme, readOnly, activeEnv])

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
