import { useEffect } from "react"
import type { RefObject } from "react"
import { useKeymap } from "@opentui/keymap/react"

export function useFormOverlayIntercept(opts: {
  visible: boolean
  handleRef: RefObject<{
    cycleFocus?: (dir: 1 | -1) => void
    getFocus?: () => string
    commitField?: () => void
    confirm: () => unknown
  } | null>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onConfirm: (result: any) => void
  onCancel: () => void
  passThroughFocuses?: string[]
}): void {
  const { visible, handleRef, onConfirm, onCancel, passThroughFocuses } = opts
  const keymap = useKeymap()

  useEffect(() => {
    if (!visible) return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const e = ctx.event
        const handle = handleRef.current
        if (!handle) return

        if (e.name === "tab" && !e.shift) {
          e.preventDefault()
          e.stopPropagation()
          handle.cycleFocus?.(1)
          return
        }
        if (e.name === "tab" && e.shift) {
          e.preventDefault()
          e.stopPropagation()
          handle.cycleFocus?.(-1)
          return
        }
        if (e.name === "return") {
          const focus = handle.getFocus?.()
          if (focus && passThroughFocuses?.includes(focus)) {
            return
          }
          if (focus === "url") {
            e.preventDefault()
            e.stopPropagation()
            const result = handle.confirm()
            if (result) onConfirm(result)
          } else if (focus) {
            e.preventDefault()
            e.stopPropagation()
            handle.commitField?.()
          }
          return
        }
        if (e.name === "s" && e.ctrl) {
          e.preventDefault()
          e.stopPropagation()
          const result = handle.confirm()
          if (result) onConfirm(result)
          return
        }
        if (e.name === "escape") {
          e.preventDefault()
          e.stopPropagation()
          onCancel()
          return
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [visible, keymap, handleRef, onConfirm, onCancel, passThroughFocuses])
}

export function useSingleFieldFormOverlayIntercept(opts: {
  visible: boolean
  handleRef: RefObject<{ confirm: () => string | null } | null>
  onConfirm: (result: string) => void
  onCancel: () => void
}): void {
  const { visible, handleRef, onConfirm, onCancel } = opts
  const keymap = useKeymap()

  useEffect(() => {
    if (!visible) return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const e = ctx.event
        const handle = handleRef.current
        if (!handle) return

        if (e.name === "s" && e.ctrl) {
          e.preventDefault()
          e.stopPropagation()
          const result = handle.confirm()
          if (result) onConfirm(result)
          return
        }
        if (e.name === "escape") {
          e.preventDefault()
          e.stopPropagation()
          onCancel()
          return
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [visible, keymap, handleRef, onConfirm, onCancel])
}
