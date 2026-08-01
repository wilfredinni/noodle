import { useCallback, useRef, useState } from "react"
import { resolve } from "node:path"
import type { Dispatch, SetStateAction } from "react"

interface UseCollectionSwitcherProps {
  collectionDir: string
  hasUnsavedChanges: boolean
  onCollectionChange: (collectionDir: string) => void
}

export function useCollectionSwitcher({
  collectionDir,
  hasUnsavedChanges,
  onCollectionChange,
}: UseCollectionSwitcherProps): {
  collectionSwitcherVisible: boolean
  setCollectionSwitcherVisible: Dispatch<SetStateAction<boolean>>
  collectionSwitchPending: string | null
  setCollectionSwitchPending: Dispatch<SetStateAction<string | null>>
  requestCollectionSwitch: (nextDir: string) => void
  confirmCollectionSwitch: (nextDir: string) => void
} {
  const [collectionSwitcherVisible, setCollectionSwitcherVisible] =
    useState(false)
  const [collectionSwitchPending, setCollectionSwitchPending] = useState<
    string | null
  >(null)
  const collectionDirRef = useRef(collectionDir)
  collectionDirRef.current = collectionDir

  const requestCollectionSwitch = useCallback(
    (nextDir: string) => {
      const normalized = resolve(nextDir)
      setCollectionSwitcherVisible(false)
      if (normalized === collectionDirRef.current) {
        setCollectionSwitchPending(null)
        return
      }
      if (hasUnsavedChanges) {
        setCollectionSwitchPending(normalized)
        return
      }
      setCollectionSwitchPending(null)
      onCollectionChange(normalized)
    },
    [hasUnsavedChanges, onCollectionChange],
  )

  const confirmCollectionSwitch = useCallback(
    (nextDir: string) => {
      setCollectionSwitchPending(null)
      setCollectionSwitcherVisible(false)
      onCollectionChange(resolve(nextDir))
    },
    [onCollectionChange],
  )

  return {
    collectionSwitcherVisible,
    setCollectionSwitcherVisible,
    collectionSwitchPending,
    setCollectionSwitchPending,
    requestCollectionSwitch,
    confirmCollectionSwitch,
  }
}
