import { useEffect, useRef } from "react"
import type { TextareaRenderable } from "@opentui/core"
import type { Theme } from "../theme-data"
import { highlightTextarea } from "./useJsonHighlight"
import type { Environment } from "../../schema"

export function JsonBodyViewer({
  body,
  theme,
  id,
  readOnly = false,
  activeEnv,
  backgroundColor,
}: {
  body: string
  theme: Theme
  id?: string
  readOnly?: boolean
  activeEnv?: Environment | null
  backgroundColor?: string
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

  const bg = backgroundColor ?? theme.backgroundPanel

  return (
    <line-number
      minWidth={5}
      paddingRight={1}
      fg={theme.textMuted}
      bg={bg}
      style={{ flexGrow: 1 }}
      width="100%"
    >
      <textarea
        ref={ref}
        id={id}
        initialValue={body}
        backgroundColor={bg}
        textColor={theme.text}
        style={{ flexGrow: 1 }}
      />
    </line-number>
  )
}
