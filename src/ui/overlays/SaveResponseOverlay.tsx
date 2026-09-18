import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { join } from "node:path"
import { getDownloadsDir } from "../../filestore/timeline"
import { suggestedResponseFilename } from "../../responseBody"
import { validateResponseOutput } from "../../responseFile"
import { collapseUserPath } from "../../userPath"
import type { ResponseFilePending } from "../useOverlayState"
import { VarInput, type VarInputHandle } from "../VarInput"
import { ActionButton } from "../ActionButton"
import { useTheme } from "../theme"
import { Overlay } from "./Overlay"
import { EscapeClose } from "./EscapeClose"

export interface SaveResponseOverlayHandle {
  confirm: () => string | null
  setError: (error: string | null) => void
}

export const SaveResponseOverlay = forwardRef<
  SaveResponseOverlayHandle,
  { pending: ResponseFilePending; onConfirm: () => void; onClose: () => void }
>(function SaveResponseOverlay({ pending, onConfirm, onClose }, ref) {
  const theme = useTheme()
  const [path, setPath] = useState("")
  const [error, setError] = useState<string | null>(null)
  const input = useRef<VarInputHandle | null>(null)
  const edited = useRef(false)
  useEffect(() => {
    let active = true
    edited.current = false
    setError(null)
    input.current?.focus()
    getDownloadsDir()
      .then((directory) =>
        validateResponseOutput(
          join(
            directory,
            suggestedResponseFilename(pending.response, pending.requestName),
          ),
          { unique: true },
        ),
      )
      .then((availablePath) => {
        if (active && !edited.current) setPath(collapseUserPath(availablePath))
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to locate Downloads",
          )
      })
    return () => {
      active = false
    }
  }, [pending])
  useImperativeHandle(
    ref,
    () => ({
      confirm: () => {
        if (!path.trim()) {
          setError("Output file is required")
          return null
        }
        return path
      },
      setError,
    }),
    [path],
  )
  return (
    <Overlay visible width={68} padding={1} gap={1} onClose={onClose}>
      <box
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingBottom: 1,
          paddingX: 2,
        }}
      >
        <text fg={theme.text}>Save Response</text>
        <EscapeClose onClose={onClose} />
      </box>
      <box
        style={{
          paddingX: 2,
          flexDirection: "column",
          gap: 1,
          paddingBottom: 1,
        }}
      >
        <box style={{ flexDirection: "column" }}>
          <text fg={theme.textMuted}>Output File</text>
          <VarInput
            ref={input}
            value={path}
            env={null}
            isEditing
            isFocused
            onChange={(value) => {
              edited.current = true
              setPath(value)
              setError(null)
            }}
            pathCompletion={{ kind: "file" }}
            placeholder="@/Downloads/response.bin"
            backgroundColor={theme.backgroundElement}
            focusedBackgroundColor={theme.borderSubtle}
            paddingX={1}
            style={{ flexGrow: 1, flexShrink: 1 }}
          />
        </box>
        {error ? (
          <text fg={theme.error} wrapMode="word">
            {error}
          </text>
        ) : null}
      </box>
      <box
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          gap: 1,
          paddingX: 2,
        }}
      >
        <ActionButton shortcut="^S" label="save" onAction={onConfirm} />
        <ActionButton shortcut="esc" label="close" onAction={onClose} />
      </box>
    </Overlay>
  )
})
