import { useCallback, useEffect } from "react"
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
}): { confirm: () => void; cancel: () => void } {
  const { visible, handleRef, onConfirm, onCancel, passThroughFocuses } = opts
  const keymap = useKeymap()
  const confirm = useCallback(() => {
    const result = handleRef.current?.confirm()
    if (result) onConfirm(result)
  }, [handleRef, onConfirm])

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
            confirm()
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
          confirm()
          return
        }
        if (e.name === "escape") {
          e.preventDefault()
          e.stopPropagation()
          onCancel()
          return
        }
        const focus = handle.getFocus?.()
        if (
          focus &&
          passThroughFocuses?.includes(focus) &&
          !e.ctrl &&
          !e.meta &&
          !e.option &&
          !e.super &&
          !e.hyper &&
          (e.sequence ? e.sequence.charCodeAt(0) >= 32 : e.name.length === 1)
        ) {
          e.preventDefault()
          e.stopPropagation()
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [visible, keymap, handleRef, confirm, onCancel, passThroughFocuses])

  return { confirm, cancel: onCancel }
}

export function useSingleFieldFormOverlayIntercept(opts: {
  visible: boolean
  handleRef: RefObject<{ confirm: () => string | null } | null>
  onConfirm: (result: string) => void
  onCancel: () => void
}): { confirm: () => void; cancel: () => void } {
  const { visible, handleRef, onConfirm, onCancel } = opts
  const keymap = useKeymap()
  const confirm = useCallback(() => {
    const result = handleRef.current?.confirm()
    if (result) onConfirm(result)
  }, [handleRef, onConfirm])

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
          confirm()
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
  }, [visible, keymap, handleRef, confirm, onCancel])

  return { confirm, cancel: onCancel }
}
