import { useCallback, useState } from "react"

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

  const requestReload = useCallback(() => {
    if (hasUnsavedChanges) {
      setReloadPending(true)
    } else {
      onReload()
    }
  }, [hasUnsavedChanges, onReload])

  const confirmReload = useCallback(() => {
    setReloadPending(false)
    onReload()
  }, [onReload])

  const cancelReload = useCallback(() => setReloadPending(false), [])

  return { reloadPending, requestReload, confirmReload, cancelReload }
}
