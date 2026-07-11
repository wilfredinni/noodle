import { useEffect } from "react"
import type { KeyEvent } from "@opentui/core"
import { useKeymap } from "@opentui/keymap/react"

type CompletionHandler = (event: KeyEvent) => boolean

const activeHandlers = new Set<CompletionHandler>()

export function registerVariableCompletion(
  handler: CompletionHandler,
): () => void {
  activeHandlers.add(handler)
  return () => {
    activeHandlers.delete(handler)
  }
}

export function VariableCompletionInterceptor() {
  const keymap = useKeymap()

  useEffect(() => {
    return keymap.intercept(
      "key",
      (ctx) => {
        for (const handler of activeHandlers) {
          if (handler(ctx.event)) {
            ctx.event.preventDefault()
            ctx.event.stopPropagation()
            return
          }
        }
      },
      { priority: 200 },
    )
  }, [keymap])

  return null
}
