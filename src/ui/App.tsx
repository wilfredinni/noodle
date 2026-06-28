import { useCallback, useEffect, useRef, useState } from "react"
import { join } from "node:path"
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
import { filestore, saveSettings } from "../filestore"
import { cycleFocus, type Focus } from "./focus"
import { HelpOverlay } from "./HelpOverlay"
import { ConfirmOverlay } from "./ConfirmOverlay"
import { YamlEditorOverlay } from "./YamlEditorOverlay"
import { ThemeProvider, ThemePickerOverlay, useTheme } from "./theme"
import { StatusBar } from "./StatusBar"
import { EnvSidebar } from "./EnvSidebar"
import { EnvEditorPane } from "./EnvEditorPane"
import { useEnvironmentEditor } from "./useEnvironmentEditor"
import { env } from "../env"
import type { Keybinds } from "./keybind"
import type { SaveState } from "./saveState"

const SAVE_SUCCESS_MS = 2000
const SAVE_ERROR_MS = 3000

const CONFIG_DIR = `${process.env.HOME ?? "~"}/.config/noodle`

function AppInner({
  collectionDir,
  environmentsDir,
  envNames,
  initialEnvName,
  activeIndex,
  previewIndex,
  setPreviewIndex,
  onThemeChange,
  keybinds,
  initialLayout,
  onLayoutChange,
  onEnvChange,
  onEnvListChanged,
  settingsEnv,
}: {
  collectionDir: string
  environmentsDir: string
  envNames: string[]
  initialEnvName?: string
  activeIndex: number
  previewIndex: number | null
  setPreviewIndex: (n: number | null) => void
  onThemeChange: (index: number) => void
  keybinds: Keybinds
  initialLayout: "stacked" | "side-by-side"
  onLayoutChange: (layout: "stacked" | "side-by-side") => void
  onEnvChange: (name: string | null) => void
  onEnvListChanged: () => Promise<void>
  settingsEnv?: string
}) {
  const theme = useTheme()
  const keymap = useKeymap()
  const [focus, setFocus] = useState<Focus>("sidebar")
  const focusRef = useRef(focus)
  focusRef.current = focus
  const [view, setView] = useState<"main" | "env-editor">("main")
  const viewRef = useRef(view)
  viewRef.current = view
  const [helpVisible, setHelpVisible] = useState(false)
  const [layout, setLayout] = useState<"stacked" | "side-by-side">(
    initialLayout,
  )
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" })
  const [confirmSelection, setConfirmSelection] = useState(0)
  const [collectionReloadToken, setCollectionReloadToken] = useState(0)
  const [yamlEditor, setYamlEditor] = useState<{
    visible: boolean
    filePath: string
    requestName: string
    returnFocus: Focus
  }>({ visible: false, filePath: "", requestName: "", returnFocus: "sidebar" })

  const { collection, loading, error } = useCollection(
    collectionDir,
    collectionReloadToken,
  )
  const requests = collection?.requests ?? []

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
          : yamlEditor.visible
            ? "yaml-editor"
            : "none"
    keymap.setData("app.overlay", overlay)
  }, [helpVisible, previewIndex, saveState.kind, yamlEditor.visible, keymap])

  const { selectedIndex, selectedRequest } = useSidebarSelection(
    requests,
    () => focus === "sidebar" && keymap.getData("app.overlay") === "none",
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
    keymap.setData("app.view", view)
  }, [view, keymap])

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
    envNames,
    initialEnvName,
    settingsEnv,
    onEnvChange,
  )
  const {
    state: responseState,
    trySend,
    cancelSend,
  } = useResponse(draft.draft, envState.activeEnv)

  const trySendRef = useRef(trySend)
  trySendRef.current = trySend

  const cancelSendRef = useRef(cancelSend)
  cancelSendRef.current = cancelSend

  const envStateRef = useRef(envState)
  envStateRef.current = envState

  const envEditor = useEnvironmentEditor({
    environmentsDir,
    envNames,
    activeEnvName: envState.activeEnv?.name,
    onEnvsChanged: onEnvListChanged,
    onActiveEnvChanged: (name: string) => {
      if (name === "") {
        onEnvChange(null)
      } else {
        onEnvChange(name)
      }
    },
  })
  const envEditorRef = useRef(envEditor)
  envEditorRef.current = envEditor

  const draftRef = useRef(draft)
  draftRef.current = draft

  const activeIndexRef = useRef(activeIndex)
  activeIndexRef.current = activeIndex

  const ebRef = useRef(eb)
  ebRef.current = eb

  const collectionRef = useRef(collection)
  collectionRef.current = collection

  const selectedIndexRef = useRef(selectedIndex)
  selectedIndexRef.current = selectedIndex

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

  const doSaveRef = useRef(doSave)
  doSaveRef.current = doSave

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
            const next = cycleFocus(prev, 1, viewRef.current)
            if (next === "request" && viewRef.current === "main") ebRef.current.enterBrowse()
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
            const next = cycleFocus(prev, -1, viewRef.current)
            if (next === "request" && viewRef.current === "main") ebRef.current.enterBrowse()
            return next
          }),
      },
      {
        name: "app.help",
        run: () => setHelpVisible((prev) => !prev),
      },
      {
        name: "request.edit-yaml",
        run: () => {
          const req = collectionRef.current?.requests[selectedIndexRef.current]
          if (!req || !collectionDir) return
          const filePath = join(collectionDir, `${req.id}.yml`)
          setYamlEditor({
            visible: true,
            filePath,
            requestName: req.name,
            returnFocus: focusRef.current,
          })
        },
      },
    ],
    bindings: [
      { key: "tab", cmd: "focus.next" },
      { key: "shift+tab", cmd: "focus.prev" },
      { key: keybinds.layout_toggle, cmd: "layout.toggle" },
      { key: keybinds.help_toggle, cmd: "app.help" },
      { key: keybinds.request_edit_yaml, cmd: "request.edit-yaml" },
    ],
  }))

  // ── Keymap: Base Layer ─────────────────────────────────────────────
  useBindings(() => ({
    enabled: () =>
      keymap.getData("app.mode") === "base" &&
      keymap.getData("app.overlay") === "none" &&
      keymap.getData("app.view") !== "env-editor",
    commands: [
      {
        name: "env.editor-open",
        enabled: () => keymap.getData("app.focus") === "sidebar",
        run: () => {
          const name = envStateRef.current.activeEnv?.name
          envEditorRef.current.openEditor(name)
          setView("env-editor")
          setFocus("env-sidebar")
        },
      },
      {
        name: "request.send",
        run: () => trySendRef.current?.(),
      },
      {
        name: "request.save",
        run: () => {
          const d = draftRef.current
          if (!savingRef.current && d.draft && d.isDirty) {
            doSaveRef.current()
          }
        },
      },
      {
        name: "env.cycle",
        run: () => envStateRef.current.cycle(1),
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
      { key: keybinds.request_send, cmd: "request.send" },
      { key: keybinds.request_save, cmd: "request.save" },
      { key: keybinds.env_cycle, cmd: "env.cycle" },
      { key: keybinds.env_editor, cmd: "env.editor-open" },
      { key: keybinds.theme_picker, cmd: "app.theme" },
      { key: "return", cmd: "request.edit-enter" },
      { key: "left", cmd: "request.tab-prev" },
      { key: "right", cmd: "request.tab-next" },
    ],
  }))

  // ── Keymap: Browse Layer ───────────────────────────────────────────
  useBindings(() => ({
    enabled: () =>
      keymap.getData("app.mode") === "browse" &&
      keymap.getData("app.overlay") === "none" &&
      keymap.getData("app.view") !== "env-editor",
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
        name: "browse.toggle",
        run: () => ebRef.current.toggleRow(),
      },
      {
        name: "browse.send",
        run: () => trySendRef.current?.(),
      },
      {
        name: "browse.save",
        run: () => {
          const d = draftRef.current
          if (!savingRef.current && d.draft && d.isDirty) {
            doSaveRef.current()
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
      { key: keybinds.browse_delete, cmd: "browse.delete" },
      { key: keybinds.browse_revert_all, cmd: "browse.revert-all" },
      { key: keybinds.browse_toggle, cmd: "browse.toggle" },
      { key: keybinds.request_send, cmd: "browse.send" },
      { key: keybinds.request_save, cmd: "browse.save" },
    ],
  }))

  // ── Keymap: Edit Layer ─────────────────────────────────────────────
  useBindings(() => ({
    enabled: () =>
      keymap.getData("app.mode") === "edit" &&
      keymap.getData("app.overlay") === "none" &&
      keymap.getData("app.view") !== "env-editor",
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

  // ── Cancel send on ESC ──────────────────────────────────────────────
  useEffect(() => {
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        if (ctx.event.name === "escape" && ctx.event.eventType === "press") {
          cancelSendRef.current()
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [keymap])

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

  // ── Env Editor Mode ───────────────────────────────────────────────
  useEffect(() => {
    if (view !== "env-editor" || keymap.getData("app.overlay") !== "none")
      return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const e = ctx.event
        const ee = envEditorRef.current

        if (e.name === "escape") {
          e.preventDefault()
          e.stopPropagation()
          ee.closeEditor()
          setView("main")
          setFocus("sidebar")
          return
        }

        if (e.name === "s" && e.ctrl) {
          e.preventDefault()
          e.stopPropagation()
          ee.save()
          return
        }

        const f = focusRef.current

        if (f === "env-sidebar") {
          if (e.name === "up" && ee.editingField === null) {
            e.preventDefault()
            e.stopPropagation()
            const names = ee.envNames
            const idx = ee.selectedEnvName
              ? names.indexOf(ee.selectedEnvName)
              : -1
            const prev = idx > 0 ? idx - 1 : names.length - 1
            if (names[prev]) ee.selectEnv(names[prev]!)
            return
          }
          if (e.name === "down" && ee.editingField === null) {
            e.preventDefault()
            e.stopPropagation()
            const names = ee.envNames
            const idx = ee.selectedEnvName
              ? names.indexOf(ee.selectedEnvName)
              : -1
            const next = idx < names.length - 1 ? idx + 1 : 0
            if (names[next]) ee.selectEnv(names[next]!)
            return
          }
          if (e.name === "n") {
            e.preventDefault()
            e.stopPropagation()
            ee.openEditor()
            setFocus("env-vars")
            return
          }
          if (e.name === "c" && ee.selectedEnvName) {
            e.preventDefault()
            e.stopPropagation()
            const target = `${ee.selectedEnvName} - Copy`
            ee.cloneEnv(target)
            return
          }
          if (e.name === "D" && ee.selectedEnvName) {
            e.preventDefault()
            e.stopPropagation()
            ee.deleteEnv()
            return
          }
        }

        if (f === "env-vars") {
          if (e.name === "up" && ee.editingField === null) {
            e.preventDefault()
            e.stopPropagation()
            const prev = Math.max(0, ee.selectedRowIndex - 1)
            ee.selectRow(prev)
            return
          }
          if (e.name === "down" && ee.editingField === null) {
            e.preventDefault()
            e.stopPropagation()
            const rows = ee.draft?.varRows.length ?? 0
            const next = Math.min(rows - 1, ee.selectedRowIndex + 1)
            ee.selectRow(next)
            return
          }
          if (e.name === "return") {
            e.preventDefault()
            e.stopPropagation()
            if (ee.editingField === null) {
              ee.editField("key")
            } else if (ee.editingField === "key") {
              ee.editField("value")
            } else {
              const next = ee.selectedRowIndex + 1
              const rows = ee.draft?.varRows.length ?? 0
              if (next < rows) {
                ee.selectRow(next)
                ee.editField("key")
              } else {
                ee.editField(null)
                ee.addVar()
              }
            }
            return
          }
          if (e.name === "tab" && !e.shift) {
            e.preventDefault()
            e.stopPropagation()
            if (ee.editingField === null) {
              ee.editField("key")
            } else if (ee.editingField === "key") {
              ee.editField("value")
            } else {
              const next = ee.selectedRowIndex + 1
              const rows = ee.draft?.varRows.length ?? 0
              if (next < rows) {
                ee.selectRow(next)
                ee.editField("key")
              } else {
                setFocus((prev) => cycleFocus(prev, 1, "env-editor"))
              }
            }
            return
          }
          if (e.name === "space" && ee.editingField === null) {
            e.preventDefault()
            e.stopPropagation()
            ee.toggleVar(ee.selectedRowIndex)
            return
          }
          if (e.name === "d" && ee.editingField === null) {
            e.preventDefault()
            e.stopPropagation()
            ee.deleteVar(ee.selectedRowIndex)
            return
          }
          if (e.name === "a") {
            e.preventDefault()
            e.stopPropagation()
            ee.addVar()
            return
          }
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [view, keymap])

  const envColors: Record<string, string | undefined> = {}
  if (envState.activeEnv) {
    envColors[envState.activeEnv.name] = envState.activeEnv.color
  }

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
        {view === "main" ? (
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
              dirtyRequestIds={draft.dirtyRequestIds}
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
                params={draft.draft?.params ?? {}}
                setUrl={draft.setUrl}
                onDefocus={draft.syncUrlParams}
                focused={focus === "urlbar"}
                sending={responseState.status === "sending"}
                activeEnv={envState.activeEnv}
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
                    focused={focus === "request"}
                    activeTab={eb.activeTab}
                    activeEnv={envState.activeEnv}
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
                    focused={focus === "request"}
                    activeTab={eb.activeTab}
                    activeEnv={envState.activeEnv}
                  />
                  <ResponsePane
                    state={responseState}
                    focused={focus === "response"}
                  />
                </>
              )}
            </box>
          </box>
        ) : (
          <box
            style={{ flexDirection: "row", flexGrow: 1, gap: 1, minHeight: 0 }}
          >
            <EnvSidebar
              envNames={envEditor.envNames}
              envColors={envColors}
              selectedEnvName={envEditor.selectedEnvName}
              activeEnvName={envState.activeEnv?.name}
              onSelectEnv={envEditor.selectEnv}
              onCreate={() => {
                envEditor.openEditor()
                setFocus("env-vars")
              }}
              onClone={() => {
                if (envEditor.selectedEnvName) {
                  const target = `${envEditor.selectedEnvName} - Copy`
                  envEditor.cloneEnv(target)
                }
              }}
              onDelete={() => envEditor.deleteEnv()}
              focused={focus === "env-sidebar"}
            />
            <EnvEditorPane
              draft={envEditor.draft}
              selectedRowIndex={envEditor.selectedRowIndex}
              editingField={envEditor.editingField}
              dirty={envEditor.dirty}
              saving={envEditor.saving}
              error={envEditor.error}
              onNameChange={envEditor.setName}
              onColorChange={envEditor.setColor}
              onSelectRow={envEditor.selectRow}
              onUpdateVarKey={envEditor.updateVarKey}
              onUpdateVarValue={envEditor.updateVarValue}
              onToggleVar={envEditor.toggleVar}
              onDeleteVar={envEditor.deleteVar}
              onAddVar={envEditor.addVar}
              focused={focus === "env-vars"}
            />
          </box>
        )}
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
            visible
            activeIndex={activeIndex}
            previewIndex={previewIndex}
            setPreviewIndex={setPreviewIndex}
            onThemeChange={onThemeChange}
          />
        )}
        {yamlEditor.visible && (
          <YamlEditorOverlay
            visible
            filePath={yamlEditor.filePath}
            requestName={yamlEditor.requestName}
            onSaved={() => {
              setCollectionReloadToken((n) => n + 1)
              setYamlEditor({
                visible: false,
                filePath: "",
                requestName: "",
                returnFocus: "sidebar",
              })
              setFocus(yamlEditor.returnFocus)
              setSaveState({
                kind: "success",
                message: `Saved ${yamlEditor.filePath.split("/").pop() ?? ""}`,
              })
              clearSaveTimer()
              saveTimerRef.current = setTimeout(() => {
                setSaveState({ kind: "idle" })
              }, SAVE_SUCCESS_MS)
            }}
            onClose={() => {
              setYamlEditor({
                visible: false,
                filePath: "",
                requestName: "",
                returnFocus: "sidebar",
              })
              setFocus(yamlEditor.returnFocus)
            }}
          />
        )}
      </box>
      <StatusBar
        method={draft.draft?.method ?? ""}
        url={draft.draft?.url ?? ""}
        isDirty={draft.isDirty}
        sendState={responseState}
        envLabel={envState.indicatorLabel}
        envColor={envState.activeEnv?.color}
        saveState={saveState}
        kb={keybinds}
        view={view}
      />
    </box>
  )
}

export function App({
  collectionDir,
  environmentsDir,
  envList: initialEnvList,
  initialEnvName,
  settingsEnv: initialSettingsEnv,
  keybinds: keybinds,
}: {
  collectionDir: string
  environmentsDir: string
  envList: string[]
  initialEnvName?: string
  settingsEnv?: string
  keybinds: Keybinds
}) {
  const { config, updateConfig } = useConfig(CONFIG_DIR)
  const [settingsEnv, setSettingsEnv] = useState<string | undefined>(
    initialSettingsEnv,
  )

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

  const [envNames, setEnvNames] = useState<string[]>(initialEnvList)

  const handleEnvListChanged = useCallback(async () => {
    const names = await env.listEnvironments(environmentsDir)
    setEnvNames(names)
  }, [environmentsDir])

  const handleEnvChange = useCallback(
    (name: string | null) => {
      const envName = name ?? undefined
      setSettingsEnv(envName)
      saveSettings(collectionDir, { environment: envName }).catch(() => {})
    },
    [collectionDir],
  )

  return (
    <ThemeProvider activeIndex={activeIndex} previewIndex={previewIndex}>
      <AppInner
        collectionDir={collectionDir}
        environmentsDir={environmentsDir}
        envNames={envNames}
        initialEnvName={initialEnvName}
        activeIndex={activeIndex}
        previewIndex={previewIndex}
        setPreviewIndex={setPreviewIndex}
        onThemeChange={handleThemeChange}
        keybinds={keybinds}
        initialLayout={config.layout}
        onLayoutChange={handleLayoutChange}
        onEnvChange={handleEnvChange}
        onEnvListChanged={handleEnvListChanged}
        settingsEnv={settingsEnv}
      />
    </ThemeProvider>
  )
}
