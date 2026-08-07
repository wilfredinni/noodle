import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CompletionEditor } from "../variable-completion/useVariableCompletion"
import { MAX_COMPLETION_VISIBLE } from "../variable-completion/useVariableCompletion"
import { registerCompletion } from "../variable-completion/variableCompletionInterceptor"
import {
  getPathCompletionQuery,
  listPathCompletions,
  type PathCompletionItem,
  type PathCompletionOptions,
} from "./pathCompletion"

interface CompletionKeyEvent {
  name: string
  preventDefault: () => void
  stopPropagation: () => void
  defaultPrevented?: boolean
}

export interface PathCompletionState {
  active: boolean
  items: PathCompletionItem[]
  selectedIndex: number
  message?: string
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
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [message, setMessage] = useState<string>()
  const [dismissed, setDismissed] = useState(false)
  const acceptedValue = useRef<string | null>(null)
  const kind = options?.kind
  const root = options?.root
  const query = useMemo(
    () => (kind && isEditing ? getPathCompletionQuery(value, root) : null),
    [isEditing, kind, root, value],
  )

  useEffect(() => {
    if (acceptedValue.current === value) return
    acceptedValue.current = null
    setDismissed(false)
    setSelectedIndex(0)
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
    void listPathCompletions(value, { kind, root })
      .then((next) => {
        if (cancelled) return
        setItems(next)
        setSelectedIndex(0)
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
  }, [dismissed, kind, query, root, value])

  const active = Boolean(query && !dismissed)
  const handleKey = useCallback(
    (key: CompletionKeyEvent): boolean => {
      const editor = getEditor()
      if (
        !active ||
        !isEditing ||
        !kind ||
        !editor ||
        editor.isDestroyed ||
        !editor.focused ||
        key.defaultPrevented
      ) {
        return false
      }

      if (key.name === "escape") {
        setDismissed(true)
        return true
      }

      const visibleItems = items.slice(0, MAX_COMPLETION_VISIBLE)
      if (visibleItems.length === 0) {
        return ["up", "down"].includes(key.name)
      }

      if (key.name === "up" || key.name === "down") {
        setSelectedIndex((current) => {
          const next = current + (key.name === "up" ? -1 : 1)
          return next < 0
            ? visibleItems.length - 1
            : next >= visibleItems.length
              ? 0
              : next
        })
        return true
      }

      if (key.name !== "tab" && key.name !== "return") return false

      const item = visibleItems[selectedIndex] ?? visibleItems[0]!
      const selectingDirectory =
        item.type === "directory" &&
        kind === "directory" &&
        key.name === "return"
      const nextValue = selectingDirectory
        ? item.value.replace(/\/$/, "")
        : item.value

      editor.replaceText(nextValue)
      editor.cursorOffset = nextValue.length
      onChange?.(nextValue)
      setSelectedIndex(0)

      if (item.type === "file" || selectingDirectory) {
        acceptedValue.current = nextValue
        setDismissed(true)
      }
      return true
    },
    [active, getEditor, isEditing, items, kind, onChange, selectedIndex],
  )

  useEffect(() => {
    if (!active) return
    return registerCompletion(handleKey)
  }, [active, handleKey])

  return { active, items, selectedIndex, message }
}
