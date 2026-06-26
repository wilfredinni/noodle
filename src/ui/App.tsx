import { useCallback, useEffect, useRef, useState } from "react"
import { useKeymap, useBindings } from "@opentui/keymap/react"
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
import { useConfig } from "./useConfig"
import { filestore } from "../filestore"
import { cycleFocus, type Focus } from "./focus"
import { HelpOverlay } from "./HelpOverlay"
import { ConfirmOverlay } from "./ConfirmOverlay"
import { ThemeProvider, ThemePickerOverlay, useTheme } from "./theme"
import { StatusBar } from "./StatusBar"
import type { Keybinds } from "./keybind"
import type { SaveState } from "./saveState"

const SAVE_SUCCESS_MS = 2000
const SAVE_ERROR_MS = 3000

const CONFIG_DIR = `${process.env.HOME ?? "~"}/.config/noodle`

function AppInner({
  collectionDir,
  environmentsDir,
  envList,
  initialEnvName,
  activeIndex,
  previewIndex,
  setPreviewIndex,
  onThemeChange,
  keybinds,
  initialLayout,
  onLayoutChange,
  onEnvChange,
  lastEnv,
}: {
  collectionDir: string
  environmentsDir: string
  envList: string[]
  initialEnvName?: string
  activeIndex: number
  previewIndex: number | null
  setPreviewIndex: (n: number | null) => void
  onThemeChange: (index: number) => void
  keybinds: Keybinds
  initialLayout: "stacked" | "side-by-side"
  onLayoutChange: (layout: "stacked" | "side-by-side") => void
  onEnvChange: (name: string | null) => void
  lastEnv: string | null
}) {
  const theme = useTheme()
  const keymap = useKeymap()
  const { collection, loading, error } = useCollection(collectionDir)
  const requests = collection?.requests ?? []

  const [focus, setFocus] = useState<Focus>("sidebar")
  const [helpVisible, setHelpVisible] = useState(false)
  const [layout, setLayout] = useState<"stacked" | "side-by-side">(
    initialLayout,
  )
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" })
  const [confirmSelection, setConfirmSelection] = useState(0)

  useEffect(() => {
    keymap.setData("app.focus", focus)
  }, [focus, keymap])

  useEffect(() => {
    const overlay = helpVisible
      ? "help"
      : previewIndex !== null
        ? "theme"
        : saveState.kind === "confirming"
          ? "confirm"
          : "none"
    keymap.setData("app.overlay", overlay)
  }, [helpVisible, previewIndex, saveState.kind, keymap])

  const { selectedIndex, selectedRequest } = useSidebarSelection(
    requests,
    () => focus === "sidebar",
  )

  const draft = useRequestDraft(selectedRequest)
  const eb = useEditBrowse(draft.draft, draft)

  useEffect(() => {
    const mode =
      eb.editState.mode === "browsing"
        ? "browse"
        : eb.editState.mode === "editing"
          ? "edit"
          : "base"
    keymap.setData("app.mode", mode)
  }, [eb.editState.mode, keymap])

  useEffect(() => {
    if (focus !== "request") {
      const state = eb.editState
      if (state.mode === "editing") {
        eb.cancelEdit()
      } else if (state.mode === "browsing") {
        eb.exitBrowse()
      }
    }
  }, [focus, eb])

  const envState = useEnvironments(
    environmentsDir,
    envList,
    initialEnvName,
    lastEnv,
    onEnvChange,
  )
  const { state: responseState, trySend } = useResponse(
    draft.draft,
    envState.activeEnv,
  )

  const trySendRef = useRef(trySend)
  trySendRef.current = trySend

  const envStateRef = useRef(envState)
  envStateRef.current = envState

  const draftRef = useRef(draft)
  draftRef.current = draft

  const activeIndexRef = useRef(activeIndex)
  activeIndexRef.current = activeIndex

  const ebRef = useRef(eb)
  ebRef.current = eb

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

  const doSave = useCallback(() => {
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
  }, [
    draft.draft,
    draft.markSaved,
    selectedRequest,
    collectionDir,
    clearSaveTimer,
  ])

  // ── Keymap: Always-On Layer ───────────────────────────────────────
  useBindings(() => ({
    commands: [
      {
        name: "focus.next",
        enabled: () => {
          const e = ebRef.current
          if (e.editState.mode === "editing") {
            const f = e.editState.cursor.field
            if (f === "headers" || f === "params") return false
          }
          return true
        },
        run: () =>
          setFocus((prev) => {
            const next = cycleFocus(prev, 1)
            if (next === "request") ebRef.current.enterBrowse()
            return next
          }),
      },
      {
        name: "layout.toggle",
        run: () =>
          setLayout((prev) => {
            const next = prev === "stacked" ? "side-by-side" : "stacked"
            onLayoutChange(next)
            return next
          }),
      },
      {
        name: "focus.prev",
        enabled: () => {
          const e = ebRef.current
          if (e.editState.mode === "editing") {
            const f = e.editState.cursor.field
            if (f === "headers" || f === "params") return false
          }
          return true
        },
        run: () =>
          setFocus((prev) => {
            const next = cycleFocus(prev, -1)
            if (next === "request") ebRef.current.enterBrowse()
            return next
          }),
      },
    ],
    bindings: [
      { key: "tab", cmd: "focus.next" },
      { key: "shift+tab", cmd: "focus.prev" },
      { key: "l", cmd: "layout.toggle" },
    ],
  }))

  // ── Keymap: Base Layer ─────────────────────────────────────────────
  useBindings(() => ({
    enabled: () =>
      keymap.getData("app.mode") === "base" &&
      keymap.getData("app.overlay") === "none",
    commands: [
      {
        name: "request.send",
        enabled: () => keymap.getData("app.focus") !== "urlbar",
        run: () => trySendRef.current?.(),
      },
      {
        name: "request.save",
        run: () => {
          const d = draftRef.current
          if (!savingRef.current && d.draft && d.isDirty) {
            clearSaveTimer()
            setConfirmSelection(0)
            setSaveState({
              kind: "confirming",
              requestId: d.draft.id,
            })
          }
        },
      },
      {
        name: "env.prev",
        run: () => envStateRef.current.cycle(-1),
      },
      {
        name: "env.next",
        run: () => envStateRef.current.cycle(1),
      },
      {
        name: "app.help",
        run: () => {
          if (ebRef.current.editState.mode !== "inactive") return
          setHelpVisible((prev) => !prev)
        },
      },
      {
        name: "app.theme",
        run: () => setPreviewIndex(activeIndexRef.current),
      },
      {
        name: "request.edit-enter",
        enabled: () => keymap.getData("app.focus") === "request",
        run: () => {
          ebRef.current.enterBrowse()
          setFocus("request")
        },
      },
      {
        name: "request.tab-prev",
        enabled: () => keymap.getData("app.focus") === "request",
        run: () => ebRef.current.cycleInactiveTab(-1),
      },
      {
        name: "request.tab-next",
        enabled: () => keymap.getData("app.focus") === "request",
        run: () => ebRef.current.cycleInactiveTab(1),
      },
    ],
    bindings: [
      { key: "s", cmd: "request.send" },
      { key: "w", cmd: "request.save" },
      { key: "[", cmd: "env.prev" },
      { key: "]", cmd: "env.next" },
      { key: "?", cmd: "app.help" },
      { key: "t", cmd: "app.theme" },
      { key: "return", cmd: "request.edit-enter" },
      { key: "left", cmd: "request.tab-prev" },
      { key: "right", cmd: "request.tab-next" },
    ],
  }))

  // ── Keymap: Browse Layer ───────────────────────────────────────────
  useBindings(() => ({
    enabled: () => keymap.getData("app.mode") === "browse",
    commands: [
      { name: "browse.up", run: () => ebRef.current.browseUp() },
      { name: "browse.down", run: () => ebRef.current.browseDown() },
      { name: "browse.left", run: () => ebRef.current.browseLeft() },
      { name: "browse.right", run: () => ebRef.current.browseRight() },
      { name: "browse.enter", run: () => ebRef.current.enterEdit() },
      { name: "browse.escape", run: () => ebRef.current.exitBrowse() },
      { name: "browse.delete", run: () => ebRef.current.revertField() },
      { name: "browse.revert-all", run: () => ebRef.current.revertAll() },
      {
        name: "browse.send",
        run: () => trySendRef.current?.(),
      },
      {
        name: "browse.save",
        run: () => {
          const d = draftRef.current
          if (!savingRef.current && d.draft && d.isDirty) {
            clearSaveTimer()
            setConfirmSelection(0)
            setSaveState({
              kind: "confirming",
              requestId: d.draft.id,
            })
          }
        },
      },
    ],
    bindings: [
      { key: "up", cmd: "browse.up" },
      { key: "down", cmd: "browse.down" },
      { key: "left", cmd: "browse.left" },
      { key: "right", cmd: "browse.right" },
      { key: "return", cmd: "browse.enter" },
      { key: "escape", cmd: "browse.escape" },
      { key: "d", cmd: "browse.delete" },
      { key: "R", cmd: "browse.revert-all" },
      { key: "s", cmd: "browse.send" },
      { key: "w", cmd: "browse.save" },
    ],
  }))

  // ── Keymap: Edit Layer ─────────────────────────────────────────────
  useBindings(() => ({
    enabled: () => keymap.getData("app.mode") === "edit",
    commands: [
      { name: "edit.commit", run: () => ebRef.current.commitEdit() },
      { name: "edit.cancel", run: () => ebRef.current.cancelEdit() },
      { name: "edit.tab", run: () => ebRef.current.browseTab() },
    ],
    bindings: [
      { key: "return", cmd: "edit.commit" },
      { key: "escape", cmd: "edit.cancel" },
      { key: "tab", cmd: "edit.tab" },
    ],
  }))

  // ── Overlay: Save Confirm ──────────────────────────────────────────
  useEffect(() => {
    if (saveState.kind !== "confirming") return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const name = ctx.event.name
        if (name === "y" || (name === "return" && confirmSelection === 0)) {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          doSave()
        } else if (
          name === "n" ||
          name === "escape" ||
          (name === "return" && confirmSelection === 1)
        ) {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          setSaveState({ kind: "idle" })
        } else if (name === "left" || name === "up") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          setConfirmSelection(0)
        } else if (name === "right" || name === "down") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          setConfirmSelection(1)
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [saveState.kind, confirmSelection, doSave, keymap])

  // ── Overlay: Help ──────────────────────────────────────────────────
  useEffect(() => {
    if (!helpVisible) return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        if (ctx.event.name === "escape") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          setHelpVisible(false)
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [helpVisible, keymap])

  return (
    <box
      style={{
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: theme.background,
      }}
    >
      <box
        style={{
          flexDirection: "column",
          flexGrow: 1,
          paddingLeft: 1,
          paddingRight: 1,
          paddingTop: 1,
          gap: 1,
          position: "relative",
        }}
      >
        <box
          style={{ flexDirection: "row", flexGrow: 1, gap: 1, minHeight: 0 }}
        >
          <Sidebar
            collection={collection}
            loading={loading}
            error={error}
            selectedIndex={selectedIndex}
            focused={focus === "sidebar"}
            keybinds={keybinds}
          />
          <box
            style={{
              flexDirection: "column",
              flexGrow: 1,
              gap: 1,
              minHeight: 0,
            }}
          >
            <UrlBar
              method={draft.draft?.method ?? ""}
              url={draft.draft?.url ?? ""}
              setUrl={draft.setUrl}
              focused={focus === "urlbar"}
              sending={responseState.status === "sending"}
            />
            {layout === "side-by-side" ? (
              <box
                style={{
                  flexDirection: "row",
                  flexGrow: 1,
                  gap: 1,
                  minHeight: 0,
                }}
              >
                <RequestPane
                  request={draft.draft}
                  editState={eb.editState}
                  editKey={eb.editKey}
                  editValue={eb.editValue}
                  setEditKey={eb.setEditKey}
                  setEditValue={eb.setEditValue}
                  draft={draft}
                  focused={focus === "request"}
                  activeTab={eb.activeTab}
                />
                <ResponsePane
                  state={responseState}
                  focused={focus === "response"}
                />
              </box>
            ) : (
              <>
                <RequestPane
                  request={draft.draft}
                  editState={eb.editState}
                  editKey={eb.editKey}
                  editValue={eb.editValue}
                  setEditKey={eb.setEditKey}
                  setEditValue={eb.setEditValue}
                  draft={draft}
                  focused={focus === "request"}
                  activeTab={eb.activeTab}
                />
                <ResponsePane
                  state={responseState}
                  focused={focus === "response"}
                />
              </>
            )}
          </box>
        </box>
        {helpVisible && <HelpOverlay visible keybinds={keybinds} />}
        {saveState.kind === "confirming" && (
          <ConfirmOverlay
            visible
            message={`Save changes to ${saveState.requestId}?`}
            selectedIndex={confirmSelection}
          />
        )}
        {previewIndex !== null && (
          <ThemePickerOverlay
            activeIndex={activeIndex}
            previewIndex={previewIndex}
            setPreviewIndex={setPreviewIndex}
            onThemeChange={onThemeChange}
          />
        )}
      </box>
      <StatusBar
        method={draft.draft?.method ?? ""}
        url={draft.draft?.url ?? ""}
        isDirty={draft.isDirty}
        sendState={responseState}
        envLabel={envState.indicatorLabel}
        saveState={saveState}
        kb={keybinds}
      />
    </box>
  )
}

export function App({
  collectionDir,
  environmentsDir,
  envList,
  initialEnvName,
  keybinds: keybinds,
}: {
  collectionDir: string
  environmentsDir: string
  envList: string[]
  initialEnvName?: string
  keybinds: Keybinds
}) {
  const { config, updateConfig } = useConfig(CONFIG_DIR)
  const [activeIndex, setActiveIndex] = useState(config.theme)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)

  const handleThemeChange = useCallback(
    (index: number) => {
      setActiveIndex(index)
      updateConfig({ theme: index })
    },
    [updateConfig],
  )

  const handleLayoutChange = useCallback(
    (layout: "stacked" | "side-by-side") => {
      updateConfig({ layout })
    },
    [updateConfig],
  )

  const handleEnvChange = useCallback(
    (name: string | null) => {
      updateConfig({ lastEnv: name })
    },
    [updateConfig],
  )

  return (
    <ThemeProvider activeIndex={activeIndex} previewIndex={previewIndex}>
      <AppInner
        collectionDir={collectionDir}
        environmentsDir={environmentsDir}
        envList={envList}
        initialEnvName={initialEnvName}
        activeIndex={activeIndex}
        previewIndex={previewIndex}
        setPreviewIndex={setPreviewIndex}
        onThemeChange={handleThemeChange}
        keybinds={keybinds}
        initialLayout={config.layout}
        onLayoutChange={handleLayoutChange}
        onEnvChange={handleEnvChange}
        lastEnv={config.lastEnv}
      />
    </ThemeProvider>
  )
}
