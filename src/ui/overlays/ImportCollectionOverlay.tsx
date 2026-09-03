import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { MouseButton } from "@opentui/core"
import { ActionButton } from "../ActionButton"
import { Select, type SelectItem } from "../Select"
import { useTheme } from "../theme"
import { VarInput, type VarInputHandle } from "../VarInput"
import type {
  CollectionImportDestination,
  CollectionImportValues,
} from "../collectionImport"
import { EscapeClose } from "./EscapeClose"
import { Overlay } from "./Overlay"

type ImportFocus = "source" | "destination" | "parent"

export interface ImportCollectionOverlayHandle {
  cycleFocus: (direction: 1 | -1) => void
  commitField: () => void
  confirm: () => CollectionImportValues | null
  getFocus: () => ImportFocus
  setError: (message: string | null) => void
}

interface ImportCollectionOverlayProps {
  visible: boolean
  initialParentDir: string
  pending?: boolean
  onConfirm?: () => void
  onClose?: () => void
}

const DESTINATIONS: SelectItem[] = [
  { id: "new", label: "New collection" },
  { id: "current", label: "Current collection" },
]

export const ImportCollectionOverlay = forwardRef<
  ImportCollectionOverlayHandle,
  ImportCollectionOverlayProps
>(function ImportCollectionOverlay(
  { visible, initialParentDir, pending = false, onConfirm, onClose },
  ref,
) {
  const theme = useTheme()
  const [source, setSource] = useState("@/")
  const [destination, setDestination] =
    useState<CollectionImportDestination>("new")
  const [parentDir, setParentDir] = useState(initialParentDir)
  const [focus, setFocus] = useState<ImportFocus>("source")
  const [destinationOpen, setDestinationOpen] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)
  const sourceRef = useRef<VarInputHandle | null>(null)
  const parentRef = useRef<VarInputHandle | null>(null)

  const focusOrder: ImportFocus[] =
    destination === "new"
      ? ["source", "destination", "parent"]
      : ["source", "destination"]

  const cycleFocus = (direction: 1 | -1) => {
    setErrorText(null)
    setFocus((current) => {
      const index = Math.max(0, focusOrder.indexOf(current))
      return focusOrder[
        (index + direction + focusOrder.length) % focusOrder.length
      ]!
    })
  }

  useImperativeHandle(ref, () => ({
    cycleFocus,
    commitField: () => cycleFocus(1),
    confirm: () => {
      const trimmedSource = source.trim()
      const trimmedParent = parentDir.trim()
      if (!trimmedSource) {
        setErrorText("Source file is required")
        return null
      }
      if (destination === "new" && !trimmedParent) {
        setErrorText("Parent folder is required")
        return null
      }
      setErrorText(null)
      return {
        source: trimmedSource,
        destination,
        parentDir: trimmedParent,
      }
    },
    getFocus: () => focus,
    setError: setErrorText,
  }))

  useEffect(() => {
    if (!visible) return
    setSource("@/")
    setDestination("new")
    setParentDir(initialParentDir)
    setFocus("source")
    setErrorText(null)
  }, [initialParentDir, visible])

  useEffect(() => {
    if (focus === "source") sourceRef.current?.focus()
    if (focus === "parent") parentRef.current?.focus()
  }, [focus])

  return (
    <Overlay
      visible={visible}
      width={72}
      padding={1}
      gap={1}
      onClose={() => !pending && onClose?.()}
    >
      <box
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingBottom: 1,
          paddingX: 2,
        }}
      >
        <text fg={theme.text}>Import Collection</text>
        <EscapeClose onClose={() => !pending && onClose?.()} />
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
          <text fg={theme.textMuted}>Source File</text>
          <box
            onMouseDown={(event) => {
              if (event.button === MouseButton.LEFT) setFocus("source")
            }}
          >
            <VarInput
              ref={sourceRef}
              value={source}
              env={null}
              isEditing
              isFocused={focus === "source"}
              onChange={(value) => {
                setSource(value)
                setErrorText(null)
              }}
              pathCompletion={{ kind: "file" }}
              placeholder="@/api.yml"
              backgroundColor={theme.backgroundElement}
              focusedBackgroundColor={theme.borderSubtle}
              paddingX={1}
              style={{ flexGrow: 1, flexShrink: 1 }}
            />
          </box>
        </box>

        <box
          style={{
            flexDirection: "column",
            zIndex: destinationOpen ? 1 : undefined,
          }}
        >
          <text fg={theme.textMuted}>Destination</text>
          <Select
            items={DESTINATIONS}
            value={destination}
            onChange={(value) => {
              setDestination(value as CollectionImportDestination)
              setErrorText(null)
            }}
            focused={focus === "destination"}
            onOpenChange={setDestinationOpen}
            onActivate={() => setFocus("destination")}
            triggerPriority={110}
          />
        </box>

        {destination === "new" && (
          <box style={{ flexDirection: "column" }}>
            <text fg={theme.textMuted}>Parent Folder</text>
            <box
              onMouseDown={(event) => {
                if (event.button === MouseButton.LEFT) setFocus("parent")
              }}
            >
              <VarInput
                ref={parentRef}
                value={parentDir}
                env={null}
                isEditing
                isFocused={focus === "parent"}
                onChange={(value) => {
                  setParentDir(value)
                  setErrorText(null)
                }}
                pathCompletion={{ kind: "directory" }}
                placeholder="@/Collections"
                backgroundColor={theme.backgroundElement}
                focusedBackgroundColor={theme.borderSubtle}
                paddingX={1}
                style={{ flexGrow: 1, flexShrink: 1 }}
              />
            </box>
            <text fg={theme.textMuted} wrapMode="word">
              The source collection name determines the new folder name.
            </text>
          </box>
        )}

        <text fg={theme.textMuted} wrapMode="word">
          Auto-detects OpenAPI 3, Swagger 2, Postman, and Insomnia files.
        </text>
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
        <ActionButton
          shortcut="^S"
          label={pending ? "importing..." : "import"}
          disabled={pending}
          onAction={() => onConfirm?.()}
        />
        <ActionButton
          shortcut="esc"
          label="close"
          disabled={pending}
          onAction={() => onClose?.()}
        />
      </box>
    </Overlay>
  )
})
