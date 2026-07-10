import { useEffect } from "react"
import type { KeyEvent } from "@opentui/core"
import { useKeymap } from "@opentui/keymap/react"

type CompletionHandler = (event: KeyEvent) => boolean

let activeHandler: CompletionHandler | null = null

export function registerVariableCompletion(
  handler: CompletionHandler,
): () => void {
  activeHandler = handler
  return () => {
    if (activeHandler === handler) activeHandler = null
  }
}

export function VariableCompletionInterceptor() {
  const keymap = useKeymap()

  useEffect(() => {
    return keymap.intercept(
      "key",
      (ctx) => {
        if (activeHandler?.(ctx.event)) {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
        }
      },
      { priority: 200 },
    )
  }, [keymap])

  return null
}
