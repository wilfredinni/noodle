import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CompletionEditor } from "../variable-completion/useVariableCompletion"
import {
  getPathCompletionQuery,
  listPathCompletions,
  type PathCompletionItem,
  type PathCompletionOptions,
} from "./pathCompletion"

export interface PathCompletionState {
  active: boolean
  items: PathCompletionItem[]
  query: string
  message?: string
  selectItem: (index: number, finalizeDirectory?: boolean) => boolean
  dismiss: () => void
}

export function usePathCompletion({
  getEditor,
  value,
  isEditing,
  options,
  onChange,
}: {
  getEditor: () => CompletionEditor | null
  value: string
  isEditing: boolean
  options?: PathCompletionOptions
  onChange?: (value: string) => void
}): PathCompletionState {
  const [items, setItems] = useState<PathCompletionItem[]>([])
  const [message, setMessage] = useState<string>()
  const [dismissed, setDismissed] = useState(false)
  const acceptedValue = useRef<string | null>(null)
  const kind = options?.kind
  const root = options?.root
  const relativeRoot = options?.relativeRoot
  const wrapFileSelection = options?.wrapFileSelection
  const query = useMemo(
    () =>
      kind && isEditing
        ? getPathCompletionQuery(value, root, relativeRoot)
        : null,
    [isEditing, kind, relativeRoot, root, value],
  )

  useEffect(() => {
    if (acceptedValue.current === value) return
    acceptedValue.current = null
    setDismissed(false)
  }, [value])

  useEffect(() => {
    if (!query || !kind || dismissed) {
      setItems([])
      setMessage(undefined)
      return
    }

    let cancelled = false
    setItems([])
    setMessage("Loading...")
    void listPathCompletions(value, { kind, root, relativeRoot })
      .then((next) => {
        if (cancelled) return
        setItems(next)
        setMessage(next.length === 0 ? "No matching paths" : undefined)
      })
      .catch(() => {
        if (cancelled) return
        setItems([])
        setMessage("Folder unavailable")
      })
    return () => {
      cancelled = true
    }
  }, [dismissed, kind, query, relativeRoot, root, value])

  const active = Boolean(query && !dismissed)
  const selectItem = useCallback(
    (index: number, finalizeDirectory = true): boolean => {
      const editor = getEditor()
      if (
        !active ||
        !isEditing ||
        !kind ||
        !editor ||
        editor.isDestroyed ||
        !editor.focused
      ) {
        return false
      }

      const item = items[index]
      if (!item) return false

      const selectingDirectory =
        item.type === "directory" && kind === "directory" && finalizeDirectory
      let nextValue = selectingDirectory
        ? item.value.replace(/\/$/, "")
        : item.value
      if (item.type === "file" && wrapFileSelection) {
        nextValue = `@file(${nextValue})`
      }

      editor.replaceText(nextValue)
      editor.cursorOffset = nextValue.length
      onChange?.(nextValue)

      if (item.type === "file" || selectingDirectory) {
        acceptedValue.current = nextValue
        setDismissed(true)
      }
      return true
    },
    [active, getEditor, isEditing, items, kind, onChange, wrapFileSelection],
  )

  return {
    active,
    items,
    query: query?.query ?? "",
    message,
    selectItem,
    dismiss: () => setDismissed(true),
  }
}
