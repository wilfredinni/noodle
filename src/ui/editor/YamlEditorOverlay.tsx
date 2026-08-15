import { MouseButton } from "@opentui/core"
import { useCallback, useEffect, useRef, useState } from "react"
import { useBindings, useKeymap } from "@opentui/keymap/react"
import { useTheme } from "../theme"
import { Overlay } from "../overlays/Overlay"
import { EscapeClose } from "../overlays/EscapeClose"
import type { Environment } from "../../schema"
import { YamlFileEditor, type YamlFileEditorHandle } from "./YamlFileEditor"
import { displayKey } from "../keybind"

export interface YamlEditorOverlayProps {
  visible: boolean
  filePath: string
  requestName: string
  saveKey: string
  onSaved: () => void
  onClose: () => void
  activeEnv?: Environment | null
  kind?: "request" | "folder"
}

export function YamlEditorOverlay({
  visible,
  filePath,
  requestName,
  saveKey,
  onSaved,
  onClose,
  activeEnv = null,
  kind = "request",
}: YamlEditorOverlayProps) {
  const theme = useTheme()
  const keymap = useKeymap()
  const editorRef = useRef<YamlFileEditorHandle | null>(null)
  const [hoveredAction, setHoveredAction] = useState<"save" | "close" | null>(
    null,
  )
  const handleSave = useCallback(() => {
    editorRef.current?.save()
  }, [])

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  useBindings(
    () => ({
      enabled: visible,
      commands: [{ name: "yaml-editor.save", run: handleSave }],
      bindings: [{ key: saveKey, cmd: "yaml-editor.save" }],
    }),
    [handleSave, saveKey, visible],
  )

  useEffect(() => {
    if (!visible) return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        if (ctx.event.name === "escape") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          handleClose()
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [visible, handleClose, keymap])

  if (!visible) return null

  return (
    <Overlay visible={visible} width={90} padding={1} gap={1} overflow="hidden">
      <box
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          flexShrink: 0,
          paddingX: 4,
        }}
      >
        <text fg={theme.text}>
          {kind === "folder"
            ? `${requestName}/folder.yml`
            : `${requestName}.yml`}
        </text>
        <EscapeClose onClose={handleClose} />
      </box>
      <YamlFileEditor
        ref={editorRef}
        filePath={filePath}
        displayName={
          kind === "folder" ? `${requestName}/folder.yml` : `${requestName}.yml`
        }
        activeEnv={activeEnv}
        kind={kind}
        height={20}
        onSaved={onSaved}
      />
      <box
        style={{
          flexDirection: "row",
          flexShrink: 0,
        }}
      >
        <box
          style={{
            flexDirection: "row",
            justifyContent: "flex-end",
            paddingX: 2,
            flexGrow: 1,
            gap: 1,
          }}
        >
          <box
            onMouseDown={(event) => {
              if (event.button !== MouseButton.LEFT) return
              handleSave()
              event.preventDefault()
              event.stopPropagation()
            }}
            onMouseOver={() => setHoveredAction("save")}
            onMouseOut={() => setHoveredAction(null)}
            style={{
              flexDirection: "row",
              paddingX: 1,
              backgroundColor:
                hoveredAction === "save" ? theme.backgroundElement : undefined,
            }}
          >
            <text fg={theme.text}>{displayKey(saveKey)}</text>
            <text fg={theme.textMuted}> save</text>
          </box>
          <box
            onMouseDown={(event) => {
              if (event.button !== MouseButton.LEFT) return
              handleClose()
              event.preventDefault()
              event.stopPropagation()
            }}
            onMouseOver={() => setHoveredAction("close")}
            onMouseOut={() => setHoveredAction(null)}
            style={{
              flexDirection: "row",
              paddingX: 1,
              backgroundColor:
                hoveredAction === "close" ? theme.backgroundElement : undefined,
            }}
          >
            <text fg={theme.text}>esc</text>
            <text fg={theme.textMuted}> close</text>
          </box>
        </box>
      </box>
    </Overlay>
  )
}
