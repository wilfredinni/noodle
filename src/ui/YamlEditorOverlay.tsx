import { TextareaRenderable, RGBA, type BoxRenderable } from "@opentui/core"
import { useEffect, useRef, useState, useCallback } from "react"
import { useKeymap } from "@opentui/keymap/react"
import { readFile, writeFile } from "node:fs/promises"
import { useTheme } from "./theme"
import { useRenderer } from "./RendererContext"

export interface YamlEditorOverlayProps {
  visible: boolean
  filePath: string
  requestName: string
  onSaved: () => void
  onClose: () => void
}

export function YamlEditorOverlay({
  visible,
  filePath,
  requestName,
  onSaved,
  onClose,
}: YamlEditorOverlayProps) {
  const theme = useTheme()
  const renderer = useRenderer()
  const keymap = useKeymap()
  const containerRef = useRef<BoxRenderable | null>(null)
  const textareaRef = useRef<TextareaRenderable | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Mount TextareaRenderable when overlay opens
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    setReadError(null)
    setSaveError(null)

    readFile(filePath, "utf8")
      .then((content) => {
        if (cancelled || !mountedRef.current) return
        const container = containerRef.current
        if (!container) return

        const textarea = new TextareaRenderable(renderer, {
          width: "100%",
          height: "100%",
          initialValue: content,
          wrapMode: "word",
          backgroundColor: theme.backgroundPanel,
          textColor: theme.text,
          cursorColor: theme.primary,
        })

        textareaRef.current = textarea
        container.add(textarea)
        renderer.requestRender()
        textarea.focus()
      })
      .catch((e) => {
        if (cancelled || !mountedRef.current) return
        setReadError(e instanceof Error ? e.message : String(e))
      })

    return () => {
      cancelled = true
      const textarea = textareaRef.current
      if (textarea) {
        try {
          textarea.destroy()
        } catch {
          /* already destroyed */
        }
      }
      textareaRef.current = null
    }
  }, [visible, filePath, renderer, theme])

  const handleSave = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    setSaveError(null)
    const content = textarea.plainText
    writeFile(filePath, content, "utf8")
      .then(() => {
        if (!mountedRef.current) return
        onSaved()
      })
      .catch((e) => {
        if (!mountedRef.current) return
        setSaveError(e instanceof Error ? e.message : String(e))
      })
  }, [filePath, onSaved])

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  // Key intercept inside the overlay itself
  useEffect(() => {
    if (!visible) return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        if (ctx.event.name === "escape") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          handleClose()
        } else if (ctx.event.name === "s" && ctx.event.ctrl) {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          handleSave()
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [visible, handleSave, handleClose, keymap])

  if (!visible) return null

  return (
    <box
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: RGBA.fromInts(0, 0, 0, 150),
        flexDirection: "column",
      }}
    >
      <box
        style={{
          width: 70,
          height: "85%",
          backgroundColor: theme.backgroundPanel,
          flexDirection: "column",
          padding: 1,
          gap: 0,
        }}
      >
        <box
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            paddingBottom: 1,
          }}
        >
          <text fg={theme.primary}>Edit: {requestName}.yml</text>
          <text fg={theme.textMuted}>esc close</text>
        </box>
        {readError ? (
          <box
            style={{
              flexGrow: 1,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <text fg={theme.error}>Error: {readError}</text>
          </box>
        ) : (
          <box ref={containerRef} style={{ flexGrow: 1, minHeight: 0 }} />
        )}
        {saveError && <text fg={theme.error}>Save error: {saveError}</text>}
        <box
          style={{
            flexDirection: "row",
            gap: 2,
            justifyContent: "center",
            paddingTop: 1,
          }}
        >
          <box
            style={{
              backgroundColor: theme.primary,
              paddingLeft: 2,
              paddingRight: 2,
              paddingTop: 0,
              paddingBottom: 0,
            }}
          >
            <text fg={theme.background}>Save (^S)</text>
          </box>
          <box
            style={{
              backgroundColor: theme.backgroundElement,
              paddingLeft: 2,
              paddingRight: 2,
              paddingTop: 0,
              paddingBottom: 0,
            }}
          >
            <text fg={theme.textMuted}>Cancel (esc)</text>
          </box>
        </box>
      </box>
    </box>
  )
}
