import { MouseButton, type InputRenderable } from "@opentui/core"
import { useKeymap } from "@opentui/keymap/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTheme } from "../theme"

export const SETTINGS_SECRET_MASK = "******"

export function SecretInput({
  value,
  hasValue = value !== undefined && value !== "",
  focused,
  placeholder,
  onFocus,
  onCommit,
  onDraftChange,
  onError,
}: {
  value?: string
  hasValue?: boolean
  focused: boolean
  placeholder: string
  onFocus: () => void
  onCommit: (value: string) => Promise<boolean>
  onDraftChange?: (value: string) => void
  onError?: (message?: string) => void
}) {
  const theme = useTheme()
  const keymap = useKeymap()
  const inputRef = useRef<InputRenderable | null>(null)
  const previousFocused = useRef(false)
  const cancelled = useRef(false)
  const committing = useRef(false)
  const mounted = useRef(true)
  const lastCommittedDraft = useRef<string | undefined>(undefined)
  const [draft, setDraft] = useState(value ?? "")
  const [revealed, setRevealed] = useState(false)
  const draftRef = useRef(draft)
  const valueRef = useRef(value ?? "")
  const onCommitRef = useRef(onCommit)
  const onDraftChangeRef = useRef(onDraftChange)
  const onErrorRef = useRef(onError)
  draftRef.current = draft
  valueRef.current = value ?? ""
  onCommitRef.current = onCommit
  onDraftChangeRef.current = onDraftChange
  onErrorRef.current = onError

  const cancel = useCallback(() => {
    cancelled.current = true
    draftRef.current = value ?? ""
    setDraft(draftRef.current)
    onDraftChange?.(draftRef.current)
    setRevealed(false)
    onError?.()
  }, [onDraftChange, onError, value])

  const commit = useCallback(async () => {
    if (committing.current) return
    const next = draftRef.current
    if (next === valueRef.current || lastCommittedDraft.current === next) {
      if (mounted.current) setRevealed(false)
      return
    }
    committing.current = true
    lastCommittedDraft.current = next
    try {
      if (await onCommitRef.current(next)) {
        if (mounted.current) onErrorRef.current?.()
      } else {
        lastCommittedDraft.current = undefined
        if (mounted.current) {
          draftRef.current = valueRef.current
          setDraft(valueRef.current)
          onDraftChangeRef.current?.(valueRef.current)
          onErrorRef.current?.("Could not save secret")
        }
      }
    } catch (error) {
      lastCommittedDraft.current = undefined
      if (mounted.current) {
        draftRef.current = valueRef.current
        setDraft(valueRef.current)
        onDraftChangeRef.current?.(valueRef.current)
        onErrorRef.current?.(
          error instanceof Error ? error.message : String(error),
        )
      }
    } finally {
      committing.current = false
      if (mounted.current) setRevealed(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (!cancelled.current) void commit()
    }
  }, [commit])

  useEffect(() => {
    const wasFocused = previousFocused.current
    previousFocused.current = focused
    if (focused && !wasFocused) {
      cancelled.current = false
      draftRef.current = value ?? ""
      setDraft(draftRef.current)
      onDraftChange?.(draftRef.current)
      setRevealed(true)
      queueMicrotask(() => inputRef.current?.focus())
    } else if (!focused && wasFocused) {
      if (!cancelled.current) void commit()
      cancelled.current = false
      setRevealed(false)
    }
  }, [commit, focused, onDraftChange, value])

  useEffect(() => {
    if (!focused || !revealed) return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        if (ctx.event.name === "escape") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          cancel()
        } else if (ctx.event.name === "return") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          void commit()
        }
      },
      { priority: 120 },
    )
    return dispose
  }, [cancel, commit, focused, keymap, revealed])

  const displayValue = revealed ? draft : hasValue ? SETTINGS_SECRET_MASK : ""
  return (
    <input
      ref={inputRef}
      value={displayValue}
      placeholder={placeholder}
      focused={focused && revealed}
      onInput={(next) => {
        draftRef.current = next
        setDraft(next)
        onDraftChange?.(next)
      }}
      onMouseDown={(event) => {
        if (event.button !== MouseButton.LEFT) return
        if (focused && !revealed) {
          cancelled.current = false
          draftRef.current = value ?? ""
          setDraft(draftRef.current)
          onDraftChange?.(draftRef.current)
          setRevealed(true)
          queueMicrotask(() => inputRef.current?.focus())
        }
        onFocus()
      }}
      backgroundColor="transparent"
      focusedBackgroundColor="transparent"
      textColor={theme.text}
      cursorColor={theme.primary}
      placeholderColor={theme.textMuted}
      paddingX={0}
      style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}
    />
  )
}
