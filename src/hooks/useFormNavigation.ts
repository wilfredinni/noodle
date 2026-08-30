import { useCallback, useEffect, useRef, useState } from "react"

export type FormMoveResult = "moved" | "before" | "after" | "blocked"

export function useFormNavigation({
  fieldCount,
  locked = false,
  initialIndex = 0,
  resetKey,
  commitField,
}: {
  fieldCount: number
  locked?: boolean
  initialIndex?: number
  resetKey?: unknown
  commitField?: (index: number) => boolean
}) {
  const [fieldIndex, setFieldIndexState] = useState(initialIndex)
  const [selectOpen, setSelectOpenState] = useState(false)
  const fieldIndexRef = useRef(initialIndex)
  const selectOpenRef = useRef(false)

  const setFieldIndex = useCallback((index: number) => {
    fieldIndexRef.current = index
    setFieldIndexState(index)
  }, [])

  const setSelectOpen = useCallback((open: boolean) => {
    selectOpenRef.current = open
    setSelectOpenState(open)
  }, [])

  const commitCurrentField = useCallback(
    () => commitField?.(fieldIndexRef.current) !== false,
    [commitField],
  )

  const focusField = useCallback(
    (index: number) => {
      if (locked || selectOpenRef.current || index < 0 || index >= fieldCount)
        return false
      if (index === fieldIndexRef.current) return true
      if (!commitCurrentField()) return false
      setFieldIndex(index)
      return true
    },
    [commitCurrentField, fieldCount, locked, setFieldIndex],
  )

  const moveField = useCallback(
    (direction: 1 | -1): FormMoveResult => {
      if (locked || selectOpenRef.current) return "blocked"
      if (!commitCurrentField()) return "blocked"
      const next = fieldIndexRef.current + direction
      if (next < 0) return "before"
      if (next >= fieldCount) return "after"
      setFieldIndex(next)
      return "moved"
    },
    [commitCurrentField, fieldCount, locked, setFieldIndex],
  )

  const moveWithinFields = useCallback(
    (direction: 1 | -1) => {
      const next = Math.min(
        fieldCount - 1,
        Math.max(0, fieldIndexRef.current + direction),
      )
      return focusField(next)
    },
    [fieldCount, focusField],
  )
  const focusFirstField = useCallback(() => focusField(0), [focusField])
  const focusLastField = useCallback(
    () => focusField(fieldCount - 1),
    [fieldCount, focusField],
  )

  useEffect(() => {
    setFieldIndex(initialIndex)
    setSelectOpen(false)
  }, [initialIndex, resetKey, setFieldIndex, setSelectOpen])

  return {
    fieldIndex,
    selectOpen,
    setSelectOpen,
    focusField,
    moveField,
    moveWithinFields,
    focusFirstField,
    focusLastField,
    commitCurrentField,
  }
}
