import { afterEach, describe, expect, it } from "bun:test"
import { act, useEffect, useState } from "react"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { KeymapProvider } from "@opentui/keymap/react"
import type { InputRenderable, ScrollBoxRenderable } from "@opentui/core"
import { createTestRender } from "../testRender"
import { setupKeymap } from "./_helpers"
import { ThemeProvider } from "../../src/ui/theme"
import { RequestScriptTab } from "../../src/ui/editor/RequestScriptTab"
import {
  ScriptAuthoringContext,
  type ActiveScriptSource,
  type ScriptActions,
} from "../../src/ui/editor/ScriptEditor"
import type { CodeEditorRenderable } from "../../src/ui/editor/CodeEditor"
import type { Collection, Request } from "../../src/schema"
import { withScript } from "../../src/scriptAuthoring"
import type { ScriptPhase } from "../../src/preRequestScript"
import {
  ScriptOrderOverlay,
  type ScriptOrder,
} from "../../src/ui/overlays/ScriptOrderOverlay"
import { useOverlayState } from "../../src/ui/useOverlayState"
import { useModalKeyboardShield } from "../../src/ui/useModalKeyboardShield"

import { createGlobalLayers } from "../../src/ui/keymap/globalLayers"
import type { AppKeymapContext } from "../../src/ui/keymap/types"
import { bindingDefaults } from "../../src/ui/keybind"
import { CommandPaletteOverlay } from "../../src/ui/overlays/CommandPaletteOverlay"
import { StatusBar } from "../../src/ui/StatusBar"
import { getKeybindingHints } from "../../src/ui/keybindingHints"

const render = createTestRender()
const dirs: string[] = []
afterEach(async () => {
  for (const dir of dirs.splice(0))
    await rm(dir, { recursive: true, force: true })
})

async function mount({
  own = 'console.log("request")',
  inherited = ['console.log("folder")'],
  phase = "pre",
  width = 80,
  height = 24,
  interactive = true,
}: {
  own?: string
  inherited?: string[]
  phase?: ScriptPhase
  width?: number
  height?: number
  interactive?: boolean
} = {}) {
  const dir = await mkdtemp(join(tmpdir(), "noodle-script-tab-"))
  dirs.push(dir)
  await writeFile(join(dir, "request.js"), 'console.log("request")')
  await writeFile(join(dir, "folder.js"), 'console.log("folder")')
  const base: Request = {
    id: "users/a",
    name: "A",
    method: "GET",
    url: "https://example.com",
    headers: {},
    params: [],
    timeout: 0,
  }
  const collection: Collection = {
    id: "demo",
    name: "Demo",
    ...withScript({}, phase, inherited[1] ?? ""),
    items: [
      {
        type: "folder",
        data: {
          id: "users",
          path: "users",
          name: "Users",
          children: [],
          ...withScript({}, phase, inherited[0] ?? ""),
        },
      },
    ],
  }
  const { keymap, host } = setupKeymap()
  let request = { ...base, ...withScript({}, phase, own) }
  let replace!: (text: string) => void
  let focus!: (focused: boolean) => void
  let complete = Promise.withResolvers<void>()
  let opened: ActiveScriptSource | undefined
  let active: ActiveScriptSource | null = null
  let editing = false
  let activeOrder: ScriptOrder | null = null
  let setPalette!: (visible: boolean | ((current: boolean) => boolean)) => void
  const keybinds = bindingDefaults()
  const scriptActionsRef: { current: ScriptActions } = { current: {} }
  keymap.setData("app.focus", "request")
  keymap.setData("app.view", "main")
  keymap.setData("app.jump", "none")
  const layer = createGlobalLayers({
    keymap,
    keybinds,
    global: {
      scriptActionsRef,
      setCommandPaletteVisible: (
        visible: boolean | ((current: boolean) => boolean),
      ) => setPalette(visible),
      viewRef: { current: "main" },
      responseQueryRef: { current: null },
    },
  } as unknown as AppKeymapContext)[0]
  keymap.registerLayer({
    commands: (
      layer.commands as NonNullable<
        Parameters<typeof keymap.registerLayer>[0]["commands"]
      >
    ).filter(
      (command) =>
        command.name.startsWith("script.") ||
        command.name === "app.command-palette",
    ),
    bindings: (
      layer.bindings as NonNullable<
        Parameters<typeof keymap.registerLayer>[0]["bindings"]
      >
    ).filter(
      (binding) =>
        binding.key === keybinds.script_open_external ||
        binding.key === keybinds.script_execution_order ||
        binding.key === keybinds.command_palette,
    ),
  })
  function Harness() {
    const overlays = useOverlayState({
      previewIndex: null,
      collectionSwitcherVisible: false,
      collectionSwitchPending: null,
      reloadPending: false,
    })
    setPalette = overlays.setCommandPaletteVisible
    useModalKeyboardShield(overlays.activeOverlay)
    useEffect(() => {
      keymap.setData("app.overlay", overlays.activeOverlay)
    }, [overlays.activeOverlay])
    const [source, setSource] = useState<ActiveScriptSource | null>(null)
    const [order, setOrder] = useState<ScriptOrder | null>(null)
    const [value, setValue] = useState(request)
    const [focused, setFocused] = useState(true)
    const [edit, setEdit] = useState(false)
    useEffect(() => {
      keymap.setData("app.mode", edit ? "edit" : "base")
    }, [edit])
    active = source
    activeOrder = order
    scriptActionsRef.current = {
      open: source
        ? () => {
            opened = source
            return true
          }
        : undefined,
      order: order
        ? () => {
            overlays.setScriptOrder(order)
            return true
          }
        : undefined,
    }
    editing = edit
    request = value
    replace = (text) =>
      setValue((current) => ({
        ...current,
        ...withScript(current, phase, text),
      }))
    focus = setFocused
    return (
      <ScriptAuthoringContext.Provider
        value={{
          collectionDir: dir,
          collection,
          overlayActive: overlays.activeOverlay !== "none",
          setActiveOrder: setOrder,
          showOrder: overlays.setScriptOrder,
          open: (source) => {
            opened = source
          },
          confirm: (action) => action(),
          setActive: setSource,
        }}
      >
        <box flexDirection="column" flexGrow={1} minHeight={0}>
          <RequestScriptTab
            request={value}
            phase={phase}
            interactive={interactive}
            focused={focused}
            editing={edit}
            onActivate={() => setEdit(true)}
            onExit={() => setEdit(false)}
            onChange={replace}
            diagnosticDelayMs={0}
            onDiagnostics={() => complete.resolve()}
          />
          <StatusBar
            kb={keybinds}
            globalHints={[]}
            overlayActive={overlays.activeOverlay !== "none"}
            footerHints={
              getKeybindingHints({
                view: "main",
                focus: focused ? "request" : "sidebar",
                paneMode: edit ? "edit" : "browse",
                collectionMode: "collection",
                overlayActive: overlays.activeOverlay !== "none",
                jumpMode: false,
                sendState: { status: "idle" },
                keybinds,
              }).footer
            }
            onHintActivate={(command) => {
              keymap.dispatchCommand(command)
            }}
          />
        </box>
        {overlays.activeOverlay === "command-palette" && (
          <CommandPaletteOverlay
            visible
            commands={[
              ...(scriptActionsRef.current.open
                ? [
                    {
                      id: "script.open",
                      label: "Open Script in External Editor",
                      section: "Workspace",
                      run: scriptActionsRef.current.open,
                    },
                  ]
                : []),
              ...(scriptActionsRef.current.order
                ? [
                    {
                      id: "script.execution-order",
                      label: "Show Script Execution Order",
                      section: "Workspace",
                      run: scriptActionsRef.current.order,
                    },
                  ]
                : []),
            ]}
            onClose={() => overlays.setCommandPaletteVisible(false)}
          />
        )}
        {overlays.scriptOrder && (
          <ScriptOrderOverlay
            order={overlays.scriptOrder}
            onClose={() => overlays.setScriptOrder(null)}
          />
        )}
      </ScriptAuthoringContext.Provider>
    )
  }
  const h = await render(
    <KeymapProvider keymap={keymap}>
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness />
      </ThemeProvider>
    </KeymapProvider>,
    { width, height },
  )
  const frame = async () => {
    await act(async () => {
      await h.renderOnce()
    })
    await act(async () => {
      await h.renderOnce()
    })
    return h.captureCharFrame()
  }
  const settle = async () => {
    await act(async () => {
      await complete.promise
    })
    return frame()
  }
  if (own || !inherited.some(Boolean)) await settle()
  else await frame()
  return {
    ...h,
    host,
    keymap,
    frame,
    settle,
    clickOrder: async () => {
      const link = h.renderer.root.findDescendantById("script-order-link")!
      await act(async () => h.mockMouse.click(link.x + 1, link.y))
      await frame()
    },
    openOrder: async () => {
      await act(async () => host.press("r", { ctrl: true, meta: true }))
      await frame()
    },
    request: () => request,
    editing: () => editing,
    opened: () => opened,
    active: () => active,
    order: () => activeOrder,
    beginDiagnostics: () => {
      complete = Promise.withResolvers<void>()
    },
    replace: async (text: string) => {
      complete = Promise.withResolvers<void>()
      await act(async () => replace(text))
      await settle()
    },
    focus: async (value: boolean) => {
      await act(async () => focus(value))
      await frame()
    },
    press: async (key: string) => {
      await act(async () =>
        host.press(key.split("+").at(-1)!, {
          ctrl: key.includes("ctrl+"),
          meta: key.includes("alt+"),
          shift: key.includes("shift+"),
        }),
      )
      await frame()
    },
    editor: (prefix = "script") =>
      h.renderer.root.findDescendantById(
        `${prefix}-source`,
      ) as CodeEditorRenderable,
  }
}

describe("request script references", () => {
  it.each(["pre", "post", "tests"] as const)(
    "shows %s execution order in a reference-only modal",
    async (phase) => {
      const h = await mount({
        phase,
        inherited: ["./folder.js", 'console.log("collection")'],
      })
      expect(h.order()).not.toBeNull()
      expect(await h.frame()).not.toContain("Folder: users")
      await h.openOrder()
      const frame = await h.frame()
      const labels =
        phase === "post"
          ? ["1  This request", "2  Folder: users", "3  Collection: Demo"]
          : ["1  Collection: Demo", "2  Folder: users", "3  This request"]
      expect(frame).toContain(
        phase === "pre"
          ? "Scripts run in this order before sending the request."
          : phase === "post"
            ? "Scripts run in this order after the response and captures."
            : "Tests run in this order after declarative assertions.",
      )
      expect(frame).not.toContain("This request runs")
      expect(frame.match(/This request/g)).toHaveLength(1)
      expect(frame).not.toContain("Reference only")
      expect(frame).toMatch(/This request +Inline/)
      expect(frame).toContain("./folder.js")
      expect(frame.indexOf(labels[1]!)).toBeGreaterThan(
        frame.indexOf(labels[0]!),
      )
      expect(frame.indexOf(labels[2]!)).toBeGreaterThan(
        frame.indexOf(labels[1]!),
      )
      expect(frame).not.toContain('console.log("collection")')
      expect(h.keymap.getData("app.overlay")).toBe("script-order")
      expect(frame).not.toContain("Editable")
      expect(h.editor("inherited-script")).toBeUndefined()
      const editor = h.editor()
      const reference =
        h.renderer.root.findDescendantById("script-reference-0")!
      await act(async () => h.mockMouse.click(reference.x + 4, reference.y))
      expect(h.editor()).toBe(editor)
      expect(h.opened()).toBeUndefined()
      expect(h.editing()).toBe(false)
      await h.press("escape")
      expect(h.keymap.getData("app.overlay")).toBe("none")
      expect(await h.frame()).not.toContain("Folder: users")
      await h.press("down")
      expect(editor.focused).toBe(true)
      await h.press("escape")
      expect(editor.focused).toBe(false)
    },
  )

  it("opens from a shortcut while editing and isolates the modal without replacing the editor", async () => {
    const h = await mount()
    const editor = h.editor()
    expect(
      h.renderer.root.findDescendantById("script-execution-order"),
    ).toBeUndefined()
    expect(await h.frame()).not.toContain("run in this order")
    await h.press("tab")
    expect(editor.focused).toBe(true)
    await h.openOrder()
    expect(await h.frame()).toContain("Folder: users")
    expect(h.editor()).toBe(editor)
    expect(h.editing()).toBe(true)
    const backgroundKeys: string[] = []
    const dispose = h.keymap.intercept(
      "key",
      ({ event }) => {
        backgroundKeys.push(event.name)
      },
      { priority: 0 },
    )
    for (const key of ["x", "return", "tab", "ctrl+s", "ctrl+enter"])
      await h.press(key)
    expect(backgroundKeys).toEqual([])
    expect(h.request().scripts?.pre).toBe('console.log("request")')
    dispose()
    await h.press("escape")
    expect(h.keymap.getData("app.overlay")).toBe("none")
    expect(await h.frame()).not.toContain("Folder: users")
    expect(h.editor()).toBe(editor)
    await h.openOrder()
    expect(await h.frame()).toContain("Folder: users")
    await act(async () => h.mockMouse.click(0, 0))
    await h.frame()
    expect(h.keymap.getData("app.overlay")).toBe("none")
    expect(editor.focused).toBe(true)
    await h.press("escape")
    h.keymap.setData("app.overlay", "confirm")
    await h.openOrder()
    expect(await h.frame()).not.toContain("Folder: users")
    h.keymap.setData("app.overlay", "none")
    await h.focus(false)
    await h.openOrder()
    expect(await h.frame()).not.toContain("Folder: users")
  })

  it("keeps the colored description link usable after wrapping and without pane focus", async () => {
    const h = await mount({ width: 120, height: 18 })
    let frame = await h.frame()
    expect(frame).toContain(
      "Write inline or use a .js file. See execution order.",
    )
    expect(frame.split("\n").at(-2)).not.toContain("execution order")
    expect(frame.split("\n").at(-2)).not.toContain("^alt+r")
    const line = frame
      .split("\n")
      .findIndex((text) => text.includes("Write inline"))
    await act(async () => h.mockMouse.click(1, line))
    expect(h.keymap.getData("app.overlay")).toBe("none")
    await act(async () => h.resize(30, 9))
    frame = await h.frame()
    const link = h.renderer.root.findDescendantById("script-order-link")!
    expect(link.x).toBeGreaterThanOrEqual(0)
    expect(link.x + link.width).toBeLessThanOrEqual(30)
    expect(link.y).toBeLessThan(8)
    const spans = h.captureSpans().lines[link.y]!.spans
    const colored = spans.find((span) => span.text.includes("execution order"))
    expect(colored).toBeDefined()
    expect(colored!.fg).not.toEqual(
      spans.find((span) => span.text.includes("See"))?.fg,
    )
    await h.focus(false)
    expect(h.order()).toBeNull()
    await h.clickOrder()
    expect(h.keymap.getData("app.overlay")).toBe("script-order")
    await h.press("end")
    expect(await h.frame()).toContain("This request")
  })

  it("retains the active order through the palette and restores the editing cursor", async () => {
    const h = await mount({ width: 120 })
    await h.press("down")
    const editor = h.editor()
    expect(editor.focused).toBe(true)
    await h.press("ctrl+p")
    expect(h.keymap.getData("app.overlay")).toBe("command-palette")
    expect(await h.frame()).toContain("Show Script Execution Order")
    expect(h.order()).not.toBeNull()
    expect(editor.focused).toBe(false)
    await h.press("return")
    expect(h.keymap.getData("app.overlay")).toBe("script-order")
    expect(await h.frame()).toContain("Folder: users")
    await h.press("escape")
    expect(h.editor()).toBe(editor)
    expect(editor.focused).toBe(true)
    expect(h.request().scripts?.pre).toBe('console.log("request")')
  })

  it("dispatches both description links, clearing targets when menus or other panes are active", async () => {
    const h = await mount({ own: "./request.js", width: 120 })
    const clickHint = async (label: string) => {
      const lines = (await h.frame()).split("\n")
      const y = lines.findIndex((line) => line.includes(label))
      expect(y).toBeGreaterThanOrEqual(0)
      await act(async () => h.mockMouse.click(lines[y]!.indexOf(label) + 1, y))
      await h.frame()
    }
    await clickHint("external editor")
    expect(h.opened()?.value).toBe("./request.js")
    expect(h.opened()?.source.scope).toBe("request")
    await clickHint("execution order")
    expect(await h.frame()).toContain("Folder: users")
    await h.press("escape")
    await h.replace("./folder.js")
    await h.press("ctrl+alt+x")
    expect(h.opened()?.value).toBe("./folder.js")
    await h.press("return")
    expect(h.active()).toBeNull()
    expect(h.order()).toBeNull()
    await h.openOrder()
    expect(h.keymap.getData("app.overlay")).toBe("none")
    await h.press("escape")
    expect(h.active()?.value).toBe("./folder.js")
    expect(h.order()).not.toBeNull()
    await h.focus(false)
    expect(h.active()).toBeNull()
    expect(h.order()).toBeNull()
    await h.openOrder()
    expect(h.keymap.getData("app.overlay")).toBe("none")
    const readonly = await mount({ own: "", interactive: false })
    await readonly.clickOrder()
    expect(await readonly.frame()).toContain("Folder: users")
  })

  it("keeps a request-only script direct, including the empty state", async () => {
    const h = await mount({ inherited: [] })
    expect(await h.frame()).not.toMatch(
      /run in this order|This request|Add request/,
    )
    expect(await h.frame()).toContain("Write inline or use a .js file.")
    expect(
      h.renderer.root.findDescendantById("script-order-link"),
    ).toBeUndefined()
    await h.replace("")
    expect(await h.frame()).not.toMatch(
      /run in this order|This request|Add request/,
    )
    expect(h.editor()).toBeDefined()
  })

  it("shows one inherited reference and adds or cancels only a request script", async () => {
    const h = await mount({ own: "", inherited: ["./folder.js"] })
    expect(await h.frame()).toContain(
      "No script on this request. See execution order.",
    )
    await h.clickOrder()
    expect(await h.frame()).toContain("before sending the request.")
    expect(await h.frame()).toContain("Folder: users")
    expect(await h.frame()).not.toMatch(
      /This request runs|Source:|Open in external/,
    )
    expect(h.editor()).toBeUndefined()
    expect(h.editor("inherited-script")).toBeUndefined()
    expect(h.active()).toBeNull()
    await h.press("escape")
    await h.press("down")
    h.beginDiagnostics()
    await h.press("return")
    await h.settle()
    expect(h.editing()).toBe(true)
    expect(h.editor().focused).toBe(true)
    const editor = h.editor()
    await h.replace('console.log("new request")')
    expect(h.editor()).toBe(editor)
    await h.openOrder()
    expect(await h.frame()).toContain("2  This request")
    await h.press("escape")
    expect(await h.frame()).toContain('console.log("new request")')
    await h.replace("")
    expect(h.editor()).toBe(editor)
    await h.press("escape")
    expect(h.editor()).toBeUndefined()
    expect(await h.frame()).toContain("+ Add request script")
    await h.openOrder()
    expect(await h.frame()).toContain("./folder.js")
    await h.press("escape")
    expect(h.opened()).toBeUndefined()
  })

  it("keeps an empty added script mounted when switching to an external source", async () => {
    const h = await mount({ own: "" })
    h.beginDiagnostics()
    await h.press("return")
    await h.settle()
    const field = h.renderer.root.findDescendantById("script-source-field")!
    await act(async () => h.mockMouse.click(field.x + 12, field.y))
    await h.frame()
    await h.press("down")
    h.beginDiagnostics()
    await h.press("return")
    await h.settle()
    expect(h.renderer.root.findDescendantById("script-path")).toBeDefined()
    expect(await h.frame()).not.toContain("Add request script")
    await h.focus(false)
    expect(h.renderer.root.findDescendantById("script-path")).toBeUndefined()
    expect(await h.frame()).toContain("Add request script")
  })

  it("opens only the request file and keeps its controls reachable after resizing", async () => {
    const h = await mount({
      own: "./request.js",
      inherited: ["./folder.js"],
      width: 80,
      height: 18,
    })
    await h.openOrder()
    expect(h.active()?.value).toBe("./request.js")
    expect(await h.frame()).toMatch(/This request +External file/)
    const reference = h.renderer.root.findDescendantById("script-reference-0")!
    await act(async () => h.mockMouse.click(reference.x + 4, reference.y))
    await h.press("escape")
    await h.press("left")
    expect(h.active()?.value).toBe("./request.js")
    expect(h.opened()).toBeUndefined()
    await act(async () => h.resize(30, 9))
    await h.frame()
    expect(
      h.renderer.root.findDescendantById("script-execution-order"),
    ).toBeUndefined()
    await h.openOrder()
    const details = h.renderer.root.findDescendantById(
      "script-order-details",
    ) as ScrollBoxRenderable
    expect(details.scrollHeight).toBeGreaterThan(details.viewport.height)
    await h.press("end")
    expect(await h.frame()).toContain("This request")
    expect(await h.frame()).toContain("External file")
    await h.press("home")
    expect(details.scrollTop).toBe(0)
    await h.press("escape")
    await h.openOrder()
    expect(
      (
        h.renderer.root.findDescendantById(
          "script-order-details",
        ) as ScrollBoxRenderable
      ).scrollTop,
    ).toBe(0)
    await h.press("escape")
    await h.press("left")
    await h.press("down")
    await h.press("return")
    const path = h.renderer.root.findDescendantById(
      "script-path",
    ) as InputRenderable
    expect(h.editing()).toBe(true)
    expect(path.focused).toBe(true)
    expect(path.y).toBeGreaterThanOrEqual(0)
    expect(path.y).toBeLessThan(9)
    await h.press("ctrl+alt+x")
    expect(h.opened()?.source.scope).toBe("request")
    expect(h.opened()?.value).toBe("./request.js")
    expect(h.renderer.root.findDescendantById("script-open")).toBeUndefined()
  })

  it("isolates the add action from other panes, overlays, and read-only mode", async () => {
    const h = await mount({ own: "" })
    await h.focus(false)
    await h.press("return")
    expect(h.editor()).toBeUndefined()
    await h.focus(true)
    h.keymap.setData("app.overlay", "confirm")
    await h.press("return")
    expect(h.editor()).toBeUndefined()
    expect(h.editing()).toBe(false)
    const readonly = await mount({ own: "", interactive: false })
    await readonly.press("return")
    const add = readonly.renderer.root.findDescendantById("script-add")!
    await act(async () => readonly.mockMouse.click(add.x + 1, add.y))
    expect(readonly.request().scripts).toBeUndefined()
    expect(readonly.editor()).toBeUndefined()
  })
})
