import { useCallback, useEffect, useRef, useState } from "react"
import { useKeyboard } from "@opentui/react"
import { Sidebar } from "./Sidebar"
import { UrlBar } from "./UrlBar"
import { RequestPane } from "./RequestPane"
import { ResponsePane } from "./ResponsePane"
import { useCollection } from "./useCollection"
import { useSidebarSelection } from "./useSidebarSelection"
import { useResponse } from "./useResponse"
import { useRequestDraft } from "./useRequestDraft"
import { useEditBrowse } from "./useEditBrowse"
import { useEnvironments } from "./useEnvironments"
import { filestore } from "../filestore"
import { cycleFocus, hintForFocus, type Focus } from "./focus"
import { HelpOverlay } from "./HelpOverlay"
import { ThemeProvider, ThemePickerOverlay, useTheme } from "./theme"
import { PaneBorder, THEMES } from "./theme"

type SaveState =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }

const SAVE_SUCCESS_MS = 2000
const SAVE_ERROR_MS = 3000

function AppInner({
  collectionDir,
  environmentsDir,
  envList,
  initialEnvName,
  activeIndex,
  previewIndex,
  setActiveIndex,
  setPreviewIndex,
}: {
  collectionDir: string
  environmentsDir: string
  envList: string[]
  initialEnvName?: string
  activeIndex: number
  previewIndex: number | null
  setActiveIndex: (n: number) => void
  setPreviewIndex: (n: number | null) => void
}) {
  const theme = useTheme()
  const { collection, loading, error } = useCollection(collectionDir)
  const requests = collection?.requests ?? []

  const [focus, setFocus] = useState<Focus>("sidebar")
  const focusRef = useRef(focus)
  focusRef.current = focus

  const [helpVisible, setHelpVisible] = useState(false)
  const helpVisibleRef = useRef(false)
  helpVisibleRef.current = helpVisible

  const sidebarEnabledRef = useRef(true)
  const { selectedIndex, selectedRequest } = useSidebarSelection(
    requests,
    () => sidebarEnabledRef.current && !helpVisibleRef.current,
  )

  const draft = useRequestDraft(selectedRequest)
  const { editState, editValue, setEditValue, isActive, activeTab } =
    useEditBrowse(draft.draft, draft, {
      enabled: () => focusRef.current === "request" && !helpVisibleRef.current,
      onEnterEditBrowse: () => setFocus("request"),
      blocked: () => helpVisibleRef.current || previewIndex !== null,
    })
  sidebarEnabledRef.current = !isActive && focus === "sidebar"
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive

  const envState = useEnvironments(environmentsDir, envList, initialEnvName)
  const { state: responseState } = useResponse(
    draft.draft,
    envState.activeEnv,
    () =>
      helpVisibleRef.current ||
      focusRef.current === "urlbar" ||
      isActiveRef.current ||
      previewIndex !== null,
  )

  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" })
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingRef = useRef(false)

  const mountedRef = useRef(true)
  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
  }, [])

  useKeyboard((key) => {
    // help toggle — blocked while editing
    if (key.name === "?") {
      if (isActive) return
      setHelpVisible((prev) => !prev)
      return
    }
    // help visible blocks all keys except ? (handled above) and escape
    if (helpVisible) {
      if (key.name === "escape") setHelpVisible(false)
      return
    }
    // theme picker keys
    if (previewIndex !== null) {
      if (key.name === "escape") {
        setPreviewIndex(null)
        return
      }
      if (key.name === "up") {
        setPreviewIndex((previewIndex - 1 + THEMES.length) % THEMES.length)
        return
      }
      if (key.name === "down") {
        setPreviewIndex((previewIndex + 1) % THEMES.length)
        return
      }
      if (key.name === "return") {
        setActiveIndex(previewIndex)
        setPreviewIndex(null)
        return
      }
      setPreviewIndex(null)
      return
    }
    if (key.name === "tab" && !isActive) {
      setFocus((prev) => cycleFocus(prev, key.shift ? -1 : 1))
      return
    }
    if (key.name === "t" && !isActive) {
      setPreviewIndex(activeIndex)
      return
    }
    if (!isActive) {
      // env cycle
      if (envState.names.length > 0) {
        if (key.name === "[") envState.cycle(-1)
        else if (key.name === "]") envState.cycle(+1)
      }
      // save confirm prompt
      if (saveState.kind === "confirming") {
        if (key.name === "y") {
          const req = draft.draft
          if (!req || savingRef.current) return
          savingRef.current = true
          const requestId = req.id
          setSaveState({ kind: "idle" })
          filestore
            .saveRequest(collectionDir, req)
            .then(() => {
              if (!mountedRef.current) return
              if (selectedRequest?.id !== requestId) return
              draft.markSaved()
              clearSaveTimer()
              setSaveState({
                kind: "success",
                message: `Saved ${requestId}.yml`,
              })
              saveTimerRef.current = setTimeout(() => {
                setSaveState({ kind: "idle" })
              }, SAVE_SUCCESS_MS)
            })
            .catch((e: unknown) => {
              if (!mountedRef.current) return
              const msg = e instanceof Error ? e.message : String(e)
              clearSaveTimer()
              setSaveState({
                kind: "error",
                message: `Error: ${msg}`,
              })
              saveTimerRef.current = setTimeout(() => {
                setSaveState({ kind: "idle" })
              }, SAVE_ERROR_MS)
            })
            .finally(() => {
              savingRef.current = false
            })
        } else {
          setSaveState({ kind: "idle" })
        }
        return
      }
      // w keybind: trigger save confirmation
      if (key.name === "w" && !savingRef.current) {
        if (draft.draft && draft.isDirty) {
          clearSaveTimer()
          setSaveState({ kind: "confirming" })
        }
      }
    }
  })

  return (
    <box
      style={{
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: theme.background,
      }}
      border={[...PaneBorder.border]}
      customBorderChars={PaneBorder.customBorderChars}
    >
      <box style={{ flexDirection: "column", flexGrow: 1, position: "relative" }}>
        {helpVisible ? (
          <HelpOverlay visible />
        ) : (
          <box style={{ flexDirection: "row", flexGrow: 1 }}>
            <Sidebar
              collection={collection}
              loading={loading}
              error={error}
              selectedIndex={selectedIndex}
              focused={focus === "sidebar"}
            />
            <box style={{ flexDirection: "column", flexGrow: 1 }}>
              <UrlBar
                method={draft.draft?.method ?? ""}
                url={draft.draft?.url ?? ""}
                setUrl={draft.setUrl}
                focused={focus === "urlbar"}
              />
              <RequestPane
                request={draft.draft}
                editState={editState}
                editValue={editValue}
                setEditValue={setEditValue}
                draft={draft}
                focused={focus === "request"}
                activeTab={activeTab}
              />
              <ResponsePane
                state={responseState}
                focused={focus === "response"}
              />
            </box>
          </box>
        )}
        {previewIndex !== null && (
          <ThemePickerOverlay activeIndex={activeIndex} previewIndex={previewIndex} />
        )}
      </box>
      <text fg={theme.textMuted}>
        {helpVisible
          ? "[?/Esc] dismiss help"
          : saveState.kind === "confirming"
              ? `Save changes to ${draft.draft?.id ?? "?"}.yml? [y/N]`
              : saveState.kind === "success"
                ? saveState.message
                : saveState.kind === "error"
                  ? saveState.message
                  : `${hintForFocus(focus, editState.mode)} · env: ${envState.indicatorLabel}`}
      </text>
    </box>
  )
}

export function App({
  collectionDir,
  environmentsDir,
  envList,
  initialEnvName,
}: {
  collectionDir: string
  environmentsDir: string
  envList: string[]
  initialEnvName?: string
}) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)

  return (
    <ThemeProvider activeIndex={activeIndex} previewIndex={previewIndex}>
      <AppInner
        collectionDir={collectionDir}
        environmentsDir={environmentsDir}
        envList={envList}
        initialEnvName={initialEnvName}
        activeIndex={activeIndex}
        previewIndex={previewIndex}
        setActiveIndex={setActiveIndex}
        setPreviewIndex={setPreviewIndex}
      />
    </ThemeProvider>
  )
}
