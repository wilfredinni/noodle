import { MouseButton, type ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { useKeymap } from "@opentui/keymap/react"
import { basename, isAbsolute, relative, resolve } from "node:path"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react"
import type { CollectionFileError } from "../filestore/load"
import type { Environment } from "../schema"
import type { Focus } from "./focus"
import { FullBorder, LeftBar } from "./borders"
import { Frame } from "./Frame"
import { SIDEBAR_WIDTH } from "./Sidebar"
import { useTheme } from "./theme"
import { Badge } from "./Badge"
import { YamlFileEditor } from "./editor/YamlFileEditor"

const noop = () => {}

export function resolveCollectionErrorFile(
  collectionDir: string,
  file: string,
): string | null {
  const root = resolve(collectionDir)
  const target = resolve(root, file)
  const childPath = relative(root, target)
  if (
    childPath === "" ||
    childPath.startsWith("..") ||
    isAbsolute(childPath) ||
    !target.endsWith(".yml")
  ) {
    return null
  }
  return target
}

export function CollectionErrorView({
  collectionDir,
  errors,
  focus,
  activeEnv,
  onPaneFocus,
  onDelete = noop,
  onDirtyChange = noop,
  deleteActionRef,
  saveActionRef,
  onSaved,
}: {
  collectionDir: string
  errors: CollectionFileError[]
  focus: Focus
  activeEnv: Environment | null
  onPaneFocus: (focus: Focus) => void
  onDelete?: (file: string) => void
  onDirtyChange?: (dirty: boolean) => void
  deleteActionRef?: RefObject<(() => void) | null>
  saveActionRef?: RefObject<(() => void) | null>
  onSaved: () => void
}) {
  const theme = useTheme()
  const keymap = useKeymap()
  const { width: terminalWidth = 100 } = useTerminalDimensions()
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const [selectedFile, setSelectedFile] = useState(errors[0]?.file ?? "")
  const [hoveredFile, setHoveredFile] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [dirtyFiles, setDirtyFiles] = useState<Set<string>>(() => new Set())
  const editorRef = useRef<{ save: () => void } | null>(null)

  const selectedIndex = Math.max(
    0,
    errors.findIndex((error) => error.file === selectedFile),
  )
  const selectedError = errors[selectedIndex]
  const filePath = selectedError
    ? resolveCollectionErrorFile(collectionDir, selectedError.file)
    : null
  const sidebarWidth =
    terminalWidth < 70
      ? Math.max(18, Math.floor(terminalWidth * 0.4))
      : SIDEBAR_WIDTH

  useEffect(() => {
    if (errors.some((error) => error.file === selectedFile)) return
    setSelectedFile(errors[0]?.file ?? "")
  }, [errors, selectedFile])

  useEffect(() => {
    const files = new Set(errors.map((error) => error.file))
    setDirtyFiles((current) => {
      const next = new Set([...current].filter((file) => files.has(file)))
      if (
        next.size === current.size &&
        [...next].every((file) => current.has(file))
      ) {
        return current
      }
      return next
    })
  }, [errors])

  useEffect(() => {
    onDirtyChange(dirtyFiles.size > 0)
  }, [dirtyFiles, onDirtyChange])

  useEffect(() => {
    return () => onDirtyChange(false)
  }, [onDirtyChange])

  useEffect(() => {
    if (!selectedError) return
    scrollRef.current?.scrollChildIntoView(`collection-error-${selectedIndex}`)
  }, [selectedError, selectedIndex])

  const selectIndex = useCallback(
    (index: number) => {
      const next = errors[Math.max(0, Math.min(index, errors.length - 1))]
      if (next) setSelectedFile(next.file)
    },
    [errors],
  )

  const setFileDirty = useCallback((file: string, dirty: boolean) => {
    setDirtyFiles((current) => {
      if (current.has(file) === dirty) return current
      const next = new Set(current)
      if (dirty) next.add(file)
      else next.delete(file)
      return next
    })
  }, [])

  const deleteSelected = useCallback(() => {
    if (selectedError?.file.endsWith(".yml")) onDelete(selectedError.file)
  }, [onDelete, selectedError])

  const saveSelected = useCallback(() => {
    editorRef.current?.save()
  }, [])

  const handleDirtyChange = useCallback(
    (dirty: boolean) => {
      if (selectedError) setFileDirty(selectedError.file, dirty)
    },
    [selectedError, setFileDirty],
  )

  useEffect(() => {
    if (deleteActionRef) deleteActionRef.current = deleteSelected
    if (saveActionRef) saveActionRef.current = saveSelected
    return () => {
      if (deleteActionRef) deleteActionRef.current = null
      if (saveActionRef) saveActionRef.current = null
    }
  }, [deleteActionRef, deleteSelected, saveActionRef, saveSelected])

  useKeyboard((key) => {
    if (keymap.getData("app.overlay") !== "none") return
    if (focus === "folder" && key.name === "escape") {
      onPaneFocus("sidebar")
      key.preventDefault()
      return
    }
    if (focus !== "sidebar" || errors.length === 0) return
    if (key.name === "up") selectIndex(selectedIndex - 1)
    else if (key.name === "down") selectIndex(selectedIndex + 1)
    else if (key.name === "home") selectIndex(0)
    else if (key.name === "end") selectIndex(errors.length - 1)
    else if (key.name === "return") onPaneFocus("folder")
    else return
    key.preventDefault()
  })

  const initialDraft = useMemo(
    () => (selectedError ? drafts[selectedError.file] : undefined),
    [drafts, selectedError],
  )

  return (
    <box
      style={{
        flexDirection: "row",
        flexGrow: 1,
        gap: 1,
        minHeight: 0,
        minWidth: 0,
        backgroundColor: theme.backgroundPanel,
      }}
    >
      <Frame
        style={{
          width: sidebarWidth,
          flexDirection: "column",
          flexShrink: 0,
          backgroundColor: theme.backgroundPanel,
          paddingTop: 0,
          paddingBottom: 0,
          paddingLeft: 1,
          paddingRight: 1,
          gap: 1,
        }}
        border={[...FullBorder.border]}
        customBorderChars={FullBorder.customBorderChars}
        borderColor={focus === "sidebar" ? theme.primary : theme.borderSubtle}
        titleRight={
          <Badge
            bg={theme.backgroundPanel}
            fg={focus === "sidebar" ? theme.primary : theme.textMuted}
          >
            Requests
          </Badge>
        }
        onPaneFocus={() => onPaneFocus("sidebar")}
      >
        <scrollbox
          ref={scrollRef}
          focusable={false}
          scrollY
          style={{ flexGrow: 1, minHeight: 0 }}
          verticalScrollbarOptions={{
            trackOptions: {
              backgroundColor: theme.background,
              foregroundColor: theme.borderActive,
            },
          }}
        >
          {errors.map((error, index) => {
            const selected = index === selectedIndex
            const hovered = hoveredFile === error.file
            return (
              <box
                key={error.file}
                id={`collection-error-${index}`}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingLeft: 1,
                  backgroundColor:
                    selected || hovered ? theme.backgroundElement : undefined,
                }}
                border={[...LeftBar.border]}
                customBorderChars={LeftBar.customBorderChars}
                borderColor={selected ? theme.primary : theme.backgroundPanel}
                onMouseDown={(event) => {
                  if (event.button !== MouseButton.LEFT) return
                  setSelectedFile(error.file)
                  onPaneFocus("sidebar")
                  event.preventDefault()
                  event.stopPropagation()
                }}
                onMouseOver={() => setHoveredFile(error.file)}
                onMouseOut={() => setHoveredFile(null)}
              >
                <box
                  style={{
                    flexDirection: "row",
                    flexGrow: 1,
                    flexShrink: 1,
                    minWidth: 0,
                    paddingRight: 1,
                  }}
                >
                  <text fg={theme.error} style={{ width: 7, flexShrink: 0 }}>
                    ERR
                  </text>
                  <text
                    fg={theme.text}
                    wrapMode="none"
                    truncate
                    style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}
                  >
                    {error.file}
                  </text>
                </box>
                {dirtyFiles.has(error.file) && (
                  <text fg={theme.accent}>{`● `}</text>
                )}
              </box>
            )
          })}
        </scrollbox>
      </Frame>

      <Frame
        style={{
          flexDirection: "column",
          flexGrow: 1,
          minHeight: 0,
          minWidth: 0,
          backgroundColor: theme.backgroundPanel,
        }}
        border={[...FullBorder.border]}
        customBorderChars={FullBorder.customBorderChars}
        borderColor={focus === "folder" ? theme.primary : theme.borderSubtle}
        onPaneFocus={() => onPaneFocus("folder")}
      >
        {selectedError && filePath ? (
          <YamlFileEditor
            ref={editorRef}
            key={selectedError.file}
            editorId="collection-error-editor"
            filePath={filePath}
            displayName={selectedError.file}
            kind={basename(filePath) === "folder.yml" ? "folder" : "request"}
            active={focus === "folder"}
            activeEnv={activeEnv}
            initialDraft={initialDraft}
            onDraftChange={(content) =>
              setDrafts((current) => ({
                ...current,
                [selectedError.file]: content,
              }))
            }
            onDirtyChange={handleDirtyChange}
            onSaved={onSaved}
          />
        ) : selectedError ? (
          <box
            style={{
              flexGrow: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingLeft: 1,
              paddingRight: 1,
            }}
          >
            <text fg={theme.error}>{selectedError.message}</text>
          </box>
        ) : null}
      </Frame>
    </box>
  )
}
