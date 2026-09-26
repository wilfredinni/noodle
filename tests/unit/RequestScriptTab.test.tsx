import { afterEach, describe, expect, it } from "bun:test"
import { act, useState } from "react"
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
} from "../../src/ui/editor/ScriptEditor"
import type { CodeEditorRenderable } from "../../src/ui/editor/CodeEditor"
import type { Collection, Request } from "../../src/schema"
import { withScript } from "../../src/scriptAuthoring"
import type { ScriptPhase } from "../../src/preRequestScript"

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
  function Harness() {
    const [value, setValue] = useState(request)
    const [focused, setFocused] = useState(true)
    const [edit, setEdit] = useState(false)
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
          confirm: (action) => action(),
          open: (source) => {
            opened = source
          },
          setActive: (source) => {
            active = source
          },
        }}
      >
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
    openOrder: async () => {
      const header = h.renderer.root.findDescendantById(
        "script-execution-order",
      )!
      await act(async () => h.mockMouse.click(header.x + 1, header.y))
      await frame()
      await act(async () => host.press("down"))
      await frame()
    },
    request: () => request,
    editing: () => editing,
    opened: () => opened,
    active: () => active,
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
      await act(async () => host.press(key))
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
    "shows compact %s references in execution order with only the request editor",
    async (phase) => {
      const h = await mount({
        phase,
        inherited: ["./folder.js", 'console.log("collection")'],
      })
      expect(await h.frame()).toMatch(/▸ (Scripts|Tests) run/)
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
      expect(frame).not.toMatch(/This request runs|─/)
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
      expect(frame).toMatch(/▾ (Scripts|Tests) run/)
      expect(frame).not.toContain("Editable")
      expect(h.editor("inherited-script")).toBeUndefined()
      const scroll = h.renderer.root.findDescendantById(
        "script-workspace",
      ) as ScrollBoxRenderable
      expect(scroll.scrollHeight).toBeLessThanOrEqual(scroll.viewport.height)
      const editor = h.editor()
      const reference = h.renderer.root.findDescendantById(
        `script-reference-${phase === "post" ? 1 : 0}`,
      )!
      await act(async () => h.mockMouse.click(reference.x + 4, reference.y))
      await h.press("up")
      expect(h.editor()).toBe(editor)
      expect(h.opened()).toBeUndefined()
      expect(h.editing()).toBe(false)
      await h.press("down")
      expect(editor.focused).toBe(false)
      await h.press("down")
      expect(editor.focused).toBe(true)
      await h.press("escape")
      expect(editor.focused).toBe(false)
    },
  )

  it("starts closed and toggles only the execution list while preserving the editor", async () => {
    const h = await mount()
    const editor = h.editor()
    expect(await h.frame()).toContain("▸ Scripts run")
    expect(await h.frame()).not.toContain("Folder: users")
    await h.press("up")
    await h.press("return")
    expect(await h.frame()).toContain("Folder: users")
    expect(h.editor()).toBe(editor)
    await h.press("left")
    let frame = await h.frame()
    expect(frame).toContain("▸ Scripts run")
    expect(frame).not.toContain("Folder: users")
    expect(frame).toContain("Source:")
    expect(frame).toContain('console.log("request")')
    expect(h.editor()).toBe(editor)
    await h.press("right")
    expect(await h.frame()).toContain("Folder: users")
    const header = h.renderer.root.findDescendantById("script-execution-order")!
    await act(async () => h.mockMouse.click(header.x + 1, header.y))
    frame = await h.frame()
    expect(frame).toContain("▸ Scripts run")
    expect(frame).not.toContain("Folder: users")
    expect(h.editor()).toBe(editor)
    await h.press("down")
    await h.press("down")
    expect(editor.focused).toBe(true)
    await h.press("escape")
    h.keymap.setData("app.overlay", "confirm")
    await h.press("up")
    await h.press("return")
    expect(await h.frame()).not.toContain("Folder: users")
    h.keymap.setData("app.overlay", "none")
    await h.focus(false)
    await h.press("up")
    await h.press("return")
    expect(await h.frame()).not.toContain("Folder: users")
  })

  it("keeps a request-only script direct, including the empty state", async () => {
    const h = await mount({ inherited: [] })
    expect(await h.frame()).not.toMatch(
      /run in this order|This request|Add request/,
    )
    expect(await h.frame()).toContain("Source:")
    await h.replace("")
    expect(await h.frame()).not.toMatch(
      /run in this order|This request|Add request/,
    )
    expect(h.editor()).toBeDefined()
  })

  it("shows one inherited reference and adds or cancels only a request script", async () => {
    const h = await mount({ own: "", inherited: ["./folder.js"] })
    await h.openOrder()
    expect(await h.frame()).toContain("before sending the request.")
    expect(await h.frame()).toContain("Folder: users")
    expect(await h.frame()).not.toMatch(
      /This request runs|Source:|Open in external/,
    )
    expect(h.editor()).toBeUndefined()
    expect(h.editor("inherited-script")).toBeUndefined()
    expect(h.active()).toBeNull()
    h.beginDiagnostics()
    await h.press("return")
    await h.settle()
    expect(h.editing()).toBe(true)
    expect(h.editor().focused).toBe(true)
    const editor = h.editor()
    await h.replace('console.log("new request")')
    expect(h.editor()).toBe(editor)
    expect(await h.frame()).toContain("2  This request")
    expect(await h.frame()).toContain('console.log("new request")')
    await h.replace("")
    expect(h.editor()).toBe(editor)
    await h.press("escape")
    expect(h.editor()).toBeUndefined()
    expect(await h.frame()).toContain("+ Add request script")
    expect(await h.frame()).toContain("./folder.js")
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
    await h.press("up")
    expect(h.active()).toBeNull()
    await h.press("down")
    expect(h.active()?.value).toBe("./request.js")
    expect(h.opened()).toBeUndefined()
    await act(async () => h.resize(30, 9))
    await h.frame()
    await h.press("down")
    await h.press("return")
    const path = h.renderer.root.findDescendantById(
      "script-path",
    ) as InputRenderable
    expect(h.editing()).toBe(true)
    expect(path.focused).toBe(true)
    expect(path.y).toBeGreaterThanOrEqual(0)
    expect(path.y).toBeLessThan(9)
    await h.press("escape")
    await h.press("down")
    expect(await h.frame()).toContain("Open in external editor")
    await h.press("return")
    expect(h.opened()?.source.scope).toBe("request")
    expect(h.opened()?.value).toBe("./request.js")
    expect(
      (
        h.renderer.root.findDescendantById(
          "script-workspace",
        ) as ScrollBoxRenderable
      ).scrollTop,
    ).toBeGreaterThan(0)
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
