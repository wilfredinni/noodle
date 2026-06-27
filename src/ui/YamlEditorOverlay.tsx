import {
  RGBA,
  type TextareaRenderable,
  type LineNumberRenderable,
} from "@opentui/core"
import { useEffect, useRef, useState, useCallback } from "react"
import { useKeymap } from "@opentui/keymap/react"
import { readFile, writeFile } from "node:fs/promises"
import { useTheme } from "./theme"
import { highlightYaml } from "./yamlSyntax"

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
  const keymap = useKeymap()
  const textareaRef = useRef<TextareaRenderable | null>(null)
  const lineNumberRef = useRef<LineNumberRenderable | null>(null)
  const [content, setContent] = useState<string | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!visible) {
      setContent(null)
      return
    }
    setReadError(null)
    setSaveError(null)

    readFile(filePath, "utf8")
      .then((v) => {
        if (mountedRef.current) setContent(v)
      })
      .catch((e) => {
        if (mountedRef.current)
          setReadError(e instanceof Error ? e.message : String(e))
      })
  }, [visible, filePath])

  useEffect(() => {
    if (content !== null && textareaRef.current) {
      highlightYaml(textareaRef.current, content, theme)
    }
  }, [content, theme])

  const handleContentChange = useCallback(() => {
    const ta = textareaRef.current
    if (ta) {
      const text = ta.plainText
      setContent(text)
      highlightYaml(ta, text, theme)
    }
  }, [theme])

  const handleSave = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    setSaveError(null)
    writeFile(filePath, textarea.plainText, "utf8")
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
          height: "80%",
          backgroundColor: theme.backgroundPanel,
          flexDirection: "column",
          padding: 1,
          gap: 0,
          overflow: "hidden",
        }}
      >
        <box
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            flexShrink: 0,
            paddingBottom: 1,
          }}
        >
          <text fg={theme.primary}>Edit: {requestName}.yml</text>
          <text fg={theme.textMuted}>esc</text>
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
        ) : content !== null ? (
          <line-number
            ref={lineNumberRef}
            minWidth={3}
            paddingRight={1}
            fg={theme.textMuted}
            bg={theme.backgroundPanel}
            style={{ height: "100%", minHeight: 0 }}
            width="100%"
          >
            <textarea
              ref={textareaRef}
              initialValue={content}
              onContentChange={handleContentChange}
              backgroundColor={theme.backgroundPanel}
              focusedBackgroundColor={theme.backgroundPanel}
              textColor={theme.text}
              cursorColor={theme.primary}
              focused
            />
          </line-number>
        ) : (
          <text fg={theme.textMuted}>Loading...</text>
        )}
        {saveError && <text fg={theme.error}>Save error: {saveError}</text>}
      </box>
      <box
        style={{
          width: 70,
          flexDirection: "row",
          justifyContent: "space-between",
          flexShrink: 0,
          backgroundColor: theme.backgroundPanel,
          paddingLeft: 1,
          paddingRight: 1,
          paddingBottom: 1,
        }}
      >
        <box style={{ flexDirection: "row", flexGrow: 1 }}>
          <text fg={theme.primary}>^S</text>
          <text fg={theme.textMuted}> save</text>
        </box>
        <box style={{ flexDirection: "row" }}>
          <text fg={theme.primary}>esc</text>
          <text fg={theme.textMuted}> close</text>
        </box>
      </box>
    </box>
  )
}
