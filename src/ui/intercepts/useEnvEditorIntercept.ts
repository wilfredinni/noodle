import { useEffect } from "react"
import type { RefObject } from "react"
import { useKeymap } from "@opentui/keymap/react"
import type { Focus } from "../focus"
import type { UseEnvironmentEditorResult } from "../../hooks/useEnvironmentEditor"
import type { EnvHeaderPaneHandle } from "../env-editor/EnvHeaderPane"
import type { AppView } from "../appState"

export function useEnvEditorIntercept(opts: {
  view: AppView
  setView: (v: AppView) => void
  focusRef: RefObject<Focus>
  setFocus: (f: Focus) => void
  envEditorRef: RefObject<UseEnvironmentEditorResult>
  envHeaderRef: RefObject<EnvHeaderPaneHandle | null>
  headerFieldRef: RefObject<"name" | "color">
  envDeletePendingRef: RefObject<string | null>
}): void {
  const keymap = useKeymap()
  const {
    view,
    setView,
    focusRef,
    setFocus,
    envEditorRef,
    envHeaderRef,
    headerFieldRef,
    envDeletePendingRef,
  } = opts

  useEffect(() => {
    if (view !== "env-editor") return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const e = ctx.event
        const ee = envEditorRef.current

        if (keymap.getData("app.overlay") !== "none") return

        const f = focusRef.current

        if (f === "env-sidebar") {
          if (e.name === "up" && ee.draft !== null) {
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
          if (e.name === "down" && ee.draft !== null) {
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
          if (e.name === "home" && ee.draft !== null) {
            e.preventDefault()
            e.stopPropagation()
            const names = ee.envNames
            if (names[0]) ee.selectEnv(names[0])
            return
          }
          if (e.name === "end" && ee.draft !== null) {
            e.preventDefault()
            e.stopPropagation()
            const names = ee.envNames
            const last = names[names.length - 1]
            if (last) ee.selectEnv(last)
            return
          }
        }

        if (f === "env-header") {
          if (e.name === "tab" && !e.shift) {
            e.preventDefault()
            e.stopPropagation()
            if (headerFieldRef.current === "name") {
              headerFieldRef.current = "color"
              envHeaderRef.current?.focusColor()
            } else {
              headerFieldRef.current = "name"
              setFocus("env-vars")
              ee.enterBrowse()
            }
            return
          }
          if (e.name === "tab" && e.shift) {
            e.preventDefault()
            e.stopPropagation()
            if (headerFieldRef.current === "color") {
              headerFieldRef.current = "name"
              envHeaderRef.current?.focusName()
            } else {
              headerFieldRef.current = "color"
              setFocus("env-sidebar")
            }
            return
          }
        }

        if (e.name === "escape" && envDeletePendingRef.current === null) {
          e.preventDefault()
          e.stopPropagation()
          ee.closeEditor()
          setView("main")
          setFocus("sidebar")
          return
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [
    view,
    keymap,
    focusRef,
    envEditorRef,
    envHeaderRef,
    headerFieldRef,
    setFocus,
    envDeletePendingRef,
    setView,
  ])
}
