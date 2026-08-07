import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { MouseButton } from "@opentui/core"
import {
  getExportTargetPath,
  type ExportCollectionValues,
  type ExportFormat,
} from "../collectionExport"
import { Select, type SelectItem } from "../Select"
import { useTheme } from "../theme"
import { VarInput, type VarInputHandle } from "../VarInput"
import { EscapeClose } from "./EscapeClose"
import { Overlay } from "./Overlay"

export interface ExportCollectionOverlayHandle {
  cycleFocus: (direction: 1 | -1) => void
  commitField: () => void
  confirm: () => ExportCollectionValues | null
  getFocus: () => "format" | "output"
  setError: (message: string | null) => void
}

interface ExportCollectionOverlayProps {
  visible: boolean
  collectionName: string
  pathCompletionRoot?: string
  onConfirm?: () => void
  onClose?: () => void
}

const FORMAT_ITEMS: SelectItem[] = [
  { id: "openapi", label: "OpenAPI" },
  { id: "postman", label: "Postman" },
]

export const ExportCollectionOverlay = forwardRef<
  ExportCollectionOverlayHandle,
  ExportCollectionOverlayProps
>(function ExportCollectionOverlay(
  { visible, collectionName, pathCompletionRoot, onConfirm, onClose },
  ref,
) {
  const theme = useTheme()
  const [format, setFormat] = useState<ExportFormat>("openapi")
  const [outputDir, setOutputDir] = useState("@/")
  const [focus, setFocus] = useState<"format" | "output">("format")
  const [errorText, setErrorText] = useState<string | null>(null)
  const [selectOpen, setSelectOpen] = useState(false)
  const [hoveredAction, setHoveredAction] = useState<"export" | "close" | null>(
    null,
  )
  const outputRef = useRef<VarInputHandle | null>(null)

  useImperativeHandle(ref, () => ({
    cycleFocus: () => {
      setErrorText(null)
      setFocus((current) => (current === "format" ? "output" : "format"))
    },
    commitField: () => setFocus("output"),
    confirm: () => {
      if (outputDir.trim() === "") {
        setErrorText("Output folder is required")
        return null
      }
      setErrorText(null)
      return { format, outputDir }
    },
    getFocus: () => focus,
    setError: setErrorText,
  }))

  useEffect(() => {
    if (!visible) return
    setFormat("openapi")
    setOutputDir("@/")
    setFocus("format")
    setErrorText(null)
  }, [visible])

  useEffect(() => {
    if (focus === "output") outputRef.current?.focus()
  }, [focus])

  const target = getExportTargetPath(outputDir, collectionName, format)

  return (
    <Overlay visible={visible} width={68} padding={1} gap={1}>
      <box
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingBottom: 1,
          paddingX: 2,
        }}
      >
        <text fg={theme.text}>Export Collection</text>
        <EscapeClose onClose={() => onClose?.()} />
      </box>

      <box
        style={{
          paddingX: 2,
          flexDirection: "column",
          gap: 1,
          paddingBottom: 1,
        }}
      >
        <box
          style={{
            flexDirection: "column",
            zIndex: selectOpen ? 1 : undefined,
          }}
        >
          <text fg={theme.textMuted}>Format</text>
          <Select
            items={FORMAT_ITEMS}
            value={format}
            onChange={(value) => {
              setFormat(value as ExportFormat)
              setErrorText(null)
            }}
            focused={focus === "format"}
            onOpenChange={setSelectOpen}
            onActivate={() => setFocus("format")}
            triggerPriority={110}
          />
        </box>

        <box style={{ flexDirection: "column" }}>
          <text fg={theme.textMuted}>Output Folder</text>
          <box
            onMouseDown={(event) => {
              if (event.button === MouseButton.LEFT) setFocus("output")
            }}
          >
            <VarInput
              ref={outputRef}
              value={outputDir}
              env={null}
              isEditing
              isFocused={focus === "output"}
              onChange={(value) => {
                setOutputDir(value)
                setErrorText(null)
              }}
              pathCompletion={{
                kind: "directory",
                root: pathCompletionRoot,
              }}
              placeholder="@/Exports"
              backgroundColor={theme.backgroundElement}
              focusedBackgroundColor={theme.borderSubtle}
              paddingX={1}
              style={{ flexGrow: 1, flexShrink: 1 }}
            />
          </box>
          <text fg={theme.textMuted} wrapMode="word">
            Target: {target}
          </text>
        </box>

        {format === "postman" && (
          <text fg={theme.warning} wrapMode="word">
            Postman exports keep literal request values and expand local file
            paths. Review the bundle before sharing.
          </text>
        )}
        {errorText && (
          <text fg={theme.error} wrapMode="word">
            {errorText}
          </text>
        )}
      </box>

      <box
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          gap: 1,
          paddingX: 2,
        }}
      >
        <box
          onMouseDown={(event) => {
            if (event.button !== MouseButton.LEFT) return
            onConfirm?.()
            event.preventDefault()
            event.stopPropagation()
          }}
          onMouseOver={() => setHoveredAction("export")}
          onMouseOut={() => setHoveredAction(null)}
          style={{
            flexDirection: "row",
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor:
              hoveredAction === "export" ? theme.backgroundElement : undefined,
          }}
        >
          <text fg={theme.text}>^S</text>
          <text fg={theme.textMuted}> export</text>
        </box>
        <box
          onMouseDown={(event) => {
            if (event.button !== MouseButton.LEFT) return
            onClose?.()
            event.preventDefault()
            event.stopPropagation()
          }}
          onMouseOver={() => setHoveredAction("close")}
          onMouseOut={() => setHoveredAction(null)}
          style={{
            flexDirection: "row",
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor:
              hoveredAction === "close" ? theme.backgroundElement : undefined,
          }}
        >
          <text fg={theme.text}>esc</text>
          <text fg={theme.textMuted}> close</text>
        </box>
      </box>
    </Overlay>
  )
})
