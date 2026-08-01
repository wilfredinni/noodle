import { useCallback, useRef, useState } from "react"

export function useReloadGuard(
  hasUnsavedChanges: boolean,
  onReload: () => void,
): {
  reloadPending: boolean
  requestReload: () => void
  confirmReload: () => void
  cancelReload: () => void
} {
  const [reloadPending, setReloadPending] = useState(false)
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges)
  hasUnsavedChangesRef.current = hasUnsavedChanges
  const onReloadRef = useRef(onReload)
  onReloadRef.current = onReload

  const requestReload = useCallback(() => {
    if (hasUnsavedChangesRef.current) {
      setReloadPending(true)
    } else {
      onReloadRef.current()
    }
  }, [])

  const confirmReload = useCallback(() => {
    setReloadPending(false)
    onReloadRef.current()
  }, [])

  const cancelReload = useCallback(() => setReloadPending(false), [])

  return { reloadPending, requestReload, confirmReload, cancelReload }
}
