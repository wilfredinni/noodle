import type { UseBindingsLayer } from "@opentui/keymap/react"
import type { AppKeymapContext } from "./types"

export function createRunnerLayer(context: AppKeymapContext): UseBindingsLayer {
  const { keymap, keybinds, global, runner } = context
  const state = () => runner.runnerRef.current
  const focus = () => global.focusRef.current
  const unlocked = () => state().phase !== "running" && !state().selectOpen

  return {
    enabled: () =>
      keymap.getData("app.view") === "runner" &&
      keymap.getData("app.overlay") === "none",
    commands: [
      {
        name: "runner.up",
        enabled: unlocked,
        run: () => {
          if (focus() === "runner-options") state().optionUp()
          else if (focus() === "runner-requests") {
            if (state().phase === "results") state().resultUp()
            else state().requestUp()
          }
        },
      },
      {
        name: "runner.down",
        enabled: unlocked,
        run: () => {
          if (focus() === "runner-options") state().optionDown()
          else if (focus() === "runner-requests") {
            if (state().phase === "results") state().resultDown()
            else state().requestDown()
          }
        },
      },
      {
        name: "runner.first",
        enabled: unlocked,
        run: () => {
          if (focus() === "runner-options") state().optionFirst()
          else if (focus() === "runner-requests") {
            if (state().phase === "results") state().resultFirst()
            else state().requestFirst()
          }
        },
      },
      {
        name: "runner.last",
        enabled: unlocked,
        run: () => {
          if (focus() === "runner-options") state().optionLast()
          else if (focus() === "runner-requests") {
            if (state().phase === "results") state().resultLast()
            else state().requestLast()
          }
        },
      },
      {
        name: "runner.run",
        enabled: () => unlocked() && state().canRun,
        run: () => void state().run(),
      },
      {
        name: "runner.activate",
        run: () => {
          if (state().phase === "running") return
          if (state().selectOpen) return
          if (focus() === "runner-options") {
            if (state().optionIndex === 1) runner.openTagFilter("include")
            else if (state().optionIndex === 2) runner.openTagFilter("exclude")
            else if (state().optionIndex === 3) state().toggleFailFast()
          } else if (focus() === "runner-requests") {
            if (state().phase === "results") {
              const row = state().resultRows[state().resultIndex]
              if (row?.kind === "result" && state().resultDetails.has(row.id))
                runner.openResultDetail()
            } else state().toggleSelected()
          }
        },
      },
      {
        name: "runner.clear-tag-filter",
        enabled: () =>
          unlocked() &&
          focus() === "runner-options" &&
          ((state().optionIndex === 1 && state().includeTag !== "") ||
            (state().optionIndex === 2 && state().excludeTag !== "")),
        run: () =>
          state().setTagFilter(
            state().optionIndex === 1 ? "include" : "exclude",
            "",
          ),
      },
      {
        name: "runner.toggle",
        enabled: () =>
          unlocked() &&
          ((focus() === "runner-options" && state().optionIndex === 3) ||
            (focus() === "runner-requests" && state().phase !== "results")),
        run: () => {
          if (focus() === "runner-options" && state().optionIndex === 3)
            state().toggleFailFast()
          else if (focus() === "runner-requests" && state().phase !== "results")
            state().toggleSelected()
        },
      },
      {
        name: "runner.page-up",
        run: () => {
          if (focus() === "runner-requests" && state().phase === "results")
            runner.detailScrollRef.current?.scrollBy(-1, "viewport")
        },
      },
      {
        name: "runner.page-down",
        run: () => {
          if (focus() === "runner-requests" && state().phase === "results")
            runner.detailScrollRef.current?.scrollBy(1, "viewport")
        },
      },
      {
        name: "runner.configure",
        enabled: () =>
          unlocked() &&
          focus() === "runner-requests" &&
          state().result !== null,
        run: () => {
          state().showConfigure()
          global.setFocus("runner-requests")
        },
      },
      {
        name: "runner.results",
        enabled: () =>
          unlocked() &&
          focus() === "runner-requests" &&
          state().result !== null,
        run: () => {
          state().showResults()
          global.setFocus("runner-requests")
        },
      },
      {
        name: "runner.focus-next",
        enabled: () => state().phase !== "running",
        run: () => {
          if (!unlocked()) return
          const current = focus()
          if (current === "runner-options") global.setFocus("runner-requests")
          else if (current === "runner-requests")
            global.setFocus("runner-options")
        },
      },
      {
        name: "runner.focus-prev",
        enabled: () => state().phase !== "running",
        run: () => {
          if (!unlocked()) return
          const current = focus()
          if (current === "runner-options") global.setFocus("runner-requests")
          else if (current === "runner-requests")
            global.setFocus("runner-options")
        },
      },
      {
        name: "runner.escape",
        run: () => {
          if (state().phase === "running" || state().selectOpen) return
          runner.close()
        },
      },
    ],
    bindings: [
      { key: "up", cmd: "runner.up" },
      { key: "down", cmd: "runner.down" },
      { key: "home", cmd: "runner.first" },
      { key: "end", cmd: "runner.last" },
      { key: "r", cmd: "runner.run" },
      { key: "return", cmd: "runner.activate" },
      { key: "space", cmd: "runner.toggle" },
      { key: keybinds.browse_delete, cmd: "runner.clear-tag-filter" },
      { key: "pageup", cmd: "runner.page-up" },
      { key: "pagedown", cmd: "runner.page-down" },
      { key: "left", cmd: "runner.configure" },
      { key: "right", cmd: "runner.results" },
      { key: "tab", cmd: "runner.focus-next" },
      { key: "shift+tab", cmd: "runner.focus-prev" },
      { key: "escape", cmd: "runner.escape" },
    ],
  }
}
