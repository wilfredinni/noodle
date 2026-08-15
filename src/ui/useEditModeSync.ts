import { useEffect, useMemo } from "react"
import { useKeymap } from "@opentui/keymap/react"
import type { UseEditBrowseResult } from "../hooks/useEditBrowse"
import type { UseFolderEditBrowseResult } from "../hooks/useFolderEditBrowse"
import type { UseEnvironmentEditorResult } from "../hooks/useEnvironmentEditor"
import type { AppView } from "./appState"
import type { Focus } from "./focus"

export type PaneMode = "base" | "browse" | "edit"

interface UseEditModeSyncProps {
  focus: Focus
  view: AppView
  eb: UseEditBrowseResult
  folderEb: UseFolderEditBrowseResult
  envEditor: UseEnvironmentEditorResult
  repairEditor?: boolean
}

function toPaneMode(mode: "inactive" | "browsing" | "editing"): PaneMode {
  if (mode === "browsing") return "browse"
  if (mode === "editing") return "edit"
  return "base"
}

export function useEditModeSync({
  focus,
  view,
  eb,
  folderEb,
  envEditor,
  repairEditor = false,
}: UseEditModeSyncProps): PaneMode {
  const keymap = useKeymap()
  const paneMode = useMemo(() => {
    if (repairEditor) return "edit"
    if (view === "env-editor" && focus === "env-vars") {
      return toPaneMode(envEditor.editState.mode)
    }
    if (focus === "folder") return toPaneMode(folderEb.editState.mode)
    return toPaneMode(eb.editState.mode)
  }, [
    view,
    focus,
    repairEditor,
    envEditor.editState.mode,
    folderEb.editState.mode,
    eb.editState.mode,
  ])

  useEffect(() => {
    keymap.setData("app.mode", paneMode)
  }, [paneMode, keymap])

  useEffect(() => {
    if (focus !== "request") {
      const state = eb.editState
      if (state.mode === "editing") eb.cancelEdit()
      else if (state.mode === "browsing") eb.exitBrowse()
    }
    if (focus !== "folder" || repairEditor) {
      const state = folderEb.editState
      if (state.mode === "editing") folderEb.cancelEdit()
      else if (state.mode === "browsing") folderEb.exitBrowse()
    }
    if (focus !== "env-vars") {
      const state = envEditor.editState
      if (state.mode === "editing") envEditor.cancelEdit()
      else if (state.mode === "browsing") envEditor.exitBrowse()
    }
  }, [
    focus,
    repairEditor,
    eb.editState.mode,
    eb.cancelEdit,
    eb.exitBrowse,
    folderEb.editState.mode,
    folderEb.cancelEdit,
    folderEb.exitBrowse,
    envEditor.editState.mode,
    envEditor.cancelEdit,
    envEditor.exitBrowse,
  ])

  useEffect(() => {
    if (
      !repairEditor &&
      focus === "folder" &&
      folderEb.editState.mode === "inactive"
    ) {
      folderEb.enterBrowse()
    }
    if (focus === "env-vars" && envEditor.editState.mode === "inactive") {
      envEditor.enterBrowse()
    }
  }, [
    focus,
    repairEditor,
    folderEb.editState.mode,
    folderEb.enterBrowse,
    envEditor.editState.mode,
    envEditor.enterBrowse,
  ])

  return paneMode
}
