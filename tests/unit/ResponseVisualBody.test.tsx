import { afterEach, describe, expect, it, jest } from "bun:test"
import { act, useState } from "react"
import { extend } from "@opentui/react"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestKeymap } from "@opentui/keymap/testing"
import {
  registerDefaultKeys,
  registerEnabledFields,
} from "@opentui/keymap/addons"
import type { Keymap } from "@opentui/keymap"
import type { Renderable, KeyEvent, ScrollBoxRenderable } from "@opentui/core"
import { createTestRender } from "../testRender"
import { ResponsePane } from "../../src/ui/ResponsePane"
import { StatusBar } from "../../src/ui/StatusBar"
import { CookieRow } from "../../src/ui/CookieRow"
import { useTheme } from "../../src/ui/theme"
import { getKeybindingHints } from "../../src/ui/keybindingHints"
import { bindingDefaults } from "../../src/ui/keybind"
import { MainView } from "../../src/ui/MainView"
import {
  toggleSidebarVisible,
  type CommandActionsConfig,
} from "../../src/ui/commandActions"
import type { Focus } from "../../src/ui/focus"
import type { UseRequestDraftResult } from "../../src/hooks/useRequestDraft"
import type { UseEditBrowseResult } from "../../src/hooks/useEditBrowse"
import { initialEditState } from "../../src/ui/editMode"
import type { ResponseQueryController } from "../../src/ui/responseQuery"
import type { SendState } from "../../src/ui/sendState"
import {
  CodeEditorRenderable,
  CodeEditorScrollBarRenderable,
} from "../../src/ui/editor/CodeEditor"

const testRender = createTestRender()
extend({
  "code-editor": CodeEditorRenderable,
  "code-editor-scrollbar": CodeEditorScrollBarRenderable,
})
afterEach(() => jest.useRealTimers())

async function mount(
  body: string,
  width = 90,
  height = 20,
  withFooter = false,
) {
  const raw = createTestKeymap()
  const keymap = raw.keymap as unknown as Keymap<Renderable, KeyEvent>
  keymap.setData("app.overlay", "none")
  registerDefaultKeys(keymap)
  registerEnabledFields(keymap)
  const controller = { current: null as ResponseQueryController | null }
  keymap.registerLayer({
    commands: [
      {
        name: "response.query",
        run: () => controller.current?.open(),
      },
      {
        name: "response.body-view",
        run: () => controller.current?.toggleView?.(),
      },
    ],
    bindings: [{ key: "/", cmd: "response.query" }],
  })
  const copy = { current: null as string | null }
  let replace!: (body: string) => void
  let focus!: (focused: boolean) => void
  let tab!: (tab: "body" | "headers") => void
  function Harness() {
    const [value, setValue] = useState(body)
    const [focused, setFocused] = useState(true)
    const [activeTab, setTab] = useState<"body" | "headers">("body")
    const [bodyView, setBodyView] = useState<"source" | "visual">("source")
    const [queryVisible, setQueryVisible] = useState(false)
    replace = setValue
    focus = setFocused
    tab = setTab
    const state: SendState = {
      status: "done",
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: value,
        timeMs: 1,
      },
    }
    return (
      <KeymapProvider keymap={keymap}>
        <box flexDirection="column" height="100%">
          <ResponsePane
            state={state}
            focused={focused}
            initialTab={activeTab}
            responseQueryRef={controller}
            responseBodyForCopyRef={copy}
            bodyView={bodyView}
            onBodyViewChange={setBodyView}
            onQueryVisibleChange={setQueryVisible}
          />
          {withFooter && (
            <StatusBar
              kb={bindingDefaults()}
              globalHints={[]}
              footerHints={
                getKeybindingHints({
                  view: "main",
                  focus: "response",
                  paneMode: "base",
                  collectionMode: "collection",
                  overlayActive: false,
                  jumpMode: false,
                  tab: activeTab,
                  sendState: state,
                  queryVisible,
                  responseBodyView: bodyView,
                  responseBodyEditorAvailable: bodyView === "source",
                  keybinds: bindingDefaults(),
                }).footer
              }
              onHintActivate={(command) => {
                keymap.dispatchCommand(command)
              }}
            />
          )}
        </box>
      </KeymapProvider>
    )
  }
  const setup = await testRender(<Harness />, { width, height })
  await act(async () => {
    await setup.renderOnce()
  })
  const render = async () => {
    await act(async () => {
      await setup.renderOnce()
    })
  }
  const press = async (
    key: string,
    options?: { ctrl?: boolean; shift?: boolean },
  ) => {
    await act(async () => {
      raw.host.press(key, options)
    })
    await render()
  }
  const visual = async () => {
    await act(async () => {
      controller.current?.toggleView?.()
    })
    await render()
  }
  const search = async (value: string) => {
    await act(async () => {
      controller.current?.open()
    })
    await render()
    jest.useFakeTimers()
    await act(async () => {
      await setup.mockInput.typeText(value)
    })
    await act(async () => {
      jest.advanceTimersByTime(150)
    })
    jest.useRealTimers()
    await render()
  }
  return {
    ...setup,
    keymap,
    controller,
    copy,
    visual,
    render,
    press,
    search,
    replace: (body: string) => replace(body),
    focus: (value: boolean) => focus(value),
    tab: (value: "body" | "headers") => tab(value),
  }
}

describe("visual response body", () => {
  it("toggles details with Space without intercepting search spaces or overlay keys", async () => {
    const view = await mount('{"user":{"name":"Alice Smith"}}')
    await view.visual()
    await view.press("down")
    await view.press("space")
    expect(view.captureCharFrame()).toContain('"Alice Smith"')
    view.keymap.setData("app.overlay", "help")
    await view.press("space")
    expect(view.captureCharFrame()).toContain('"Alice Smith"')
    view.keymap.setData("app.overlay", "none")
    await view.press("space")
    expect(view.captureCharFrame()).not.toContain('"Alice Smith"')
    await view.press("return")
    expect(view.captureCharFrame()).toContain('"Alice Smith"')
    await view.press("down")
    await view.press("space")
    expect(view.captureCharFrame()).toContain('"Alice Smith"')
    await view.search("Alice Smith")
    expect(view.captureCharFrame()).toContain("1 match")
    expect(view.renderer.currentFocusedRenderable?.id).toBe(
      "response-visual-search",
    )
  })

  it("shares Source filter geometry, match status, and Escape lifecycle", async () => {
    const source = await mount('{"name":"Alice"}')
    const visual = await mount('{"name":"Alice"}')
    await visual.visual()
    await source.press("/")
    await visual.press("/")
    const sourceInput = source.renderer.currentFocusedRenderable!
    const visualInput = visual.renderer.currentFocusedRenderable!
    expect([visualInput.x, visualInput.y, visualInput.width]).toEqual([
      sourceInput.x,
      sourceInput.y,
      sourceInput.width,
    ])
    expect(visual.captureCharFrame()).toContain(
      "Enter a key or value to filter this response",
    )
    await source.search("$.name")
    await visual.search("Alice")
    expect(source.captureCharFrame()).toContain("1 match")
    expect(visual.captureCharFrame()).toContain("1 match")
    await source.press("return")
    await visual.press("return")
    expect(source.controller.current?.isOpen()).toBe(true)
    expect(visual.controller.current?.isOpen()).toBe(true)
    await source.press("escape")
    await visual.press("escape")
    expect(source.controller.current?.isOpen()).toBe(false)
    expect(visual.controller.current?.isOpen()).toBe(false)
    expect(visual.captureCharFrame()).not.toContain("1 match")
    await visual.press("/")
    expect(visual.captureCharFrame()).toContain("Keys or values…")
    await visual.search("absent")
    expect(visual.captureCharFrame()).toContain("0 matches")
    expect(visual.captureCharFrame()).toContain("No matches")
  })

  it("only offers expansion for children or truncated values", async () => {
    const view = await mount(
      JSON.stringify({
        nested: { inside: 1 },
        short: true,
        empty: {},
        list: [],
        long: "x".repeat(150),
      }),
    )
    await view.visual()
    const line = (label: string) =>
      view
        .captureCharFrame()
        .split("\n")
        .find((line) =>
          new RegExp(`(?:VALUE|OBJECT|ARRAY)\\s+${label}\\s`).test(line),
        )!
    expect(line("nested")).toContain("▸")
    expect(line("long")).toContain("▸")
    for (const label of ["short", "empty", "list"])
      expect(line(label)).not.toMatch(/[▸▾]/)
    await view.press("down")
    await view.press("return")
    expect(line("inside")).not.toMatch(/[▸▾]/)
    await view.press("down")
    await view.press("down")
    await view.press("return")
    expect(line("nested")).toContain("▾")
    expect(line("short")).not.toMatch(/[▸▾]/)
    const empty = view.renderer.root.findDescendantById("visual-node-3")!
    await act(async () => {
      await view.mockMouse.click(empty.x + 1, empty.y)
    })
    await view.render()
    expect(line("nested")).toContain("▾")
    expect(line("empty")).not.toMatch(/[▸▾]/)
  })

  it("matches Cookies/Results hover and selection colors without stripes", async () => {
    function ReferenceRow() {
      const theme = useTheme()
      return (
        <CookieRow
          id="reference"
          kindLabel="VALUE"
          kindColor={theme.primary}
          name="Reference"
          value="preview"
          nameWidth={12}
          selected
          expanded={false}
          hovered={false}
          onSelect={() => {}}
          onHover={() => {}}
        />
      )
    }
    const reference = await testRender(<ReferenceRow />, {
      width: 90,
      height: 5,
    })
    await reference.renderOnce()
    const selectedColor = reference
      .captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((span) => span.text.includes("Reference"))!.bg
    const view = await mount('{"name":"Alice","city":"Santiago"}')
    await view.visual()
    const background = (label: string) =>
      view
        .captureSpans()
        .lines.slice(3)
        .flatMap((line) => line.spans)
        .find((span) => span.text.trim() === label)!.bg
    expect(background("name").equals(background("city"))).toBe(true)
    expect(background("name").equals(selectedColor)).toBe(false)
    const name = view.renderer.root.findDescendantById("visual-node-1")!
    await act(async () => {
      await view.mockMouse.moveTo(name.x + 2, name.y)
    })
    await view.render()
    expect(background("name").equals(selectedColor)).toBe(true)
    await act(async () => {
      await view.mockMouse.moveTo(0, 0)
    })
    await view.render()
    expect(background("name").equals(selectedColor)).toBe(false)
    await view.press("down")
    expect(background("name").equals(selectedColor)).toBe(true)
    await view.press("down")
    expect(background("city").equals(selectedColor)).toBe(true)
    await view.press("down")
    expect(background("Response").equals(selectedColor)).toBe(true)
    await view.press("up")
    expect(background("city").equals(selectedColor)).toBe(true)
  })

  it("opens one sibling accordion at a time with mouse or Enter and keeps selection on it", async () => {
    const view = await mount('{"first":{"one":1},"second":{"two":2}}')
    await view.visual()
    await view.press("down")
    await view.press("return")
    expect(view.captureCharFrame()).toMatch(/VALUE\s+one\s+1/)
    await view.press("down")
    await view.press("down")
    await view.press("return")
    expect(view.captureCharFrame()).not.toMatch(/VALUE\s+one\s+1/)
    expect(view.captureCharFrame()).toMatch(/VALUE\s+two\s+2/)
    await view.press("return")
    expect(view.captureCharFrame()).not.toMatch(/VALUE\s+two\s+2/)
    const first = view.renderer.root.findDescendantById("visual-node-1")!
    await act(async () => {
      await view.mockMouse.click(first.x + 1, first.y)
    })
    await view.render()
    expect(view.captureCharFrame()).toMatch(/VALUE\s+one\s+1/)
  })

  it("keeps the view switch exclusively in the footer and clickable during search", async () => {
    const view = await mount('{"name":"Alice"}', 110, 20, true)
    let lines = view.captureCharFrame().trimEnd().split("\n")
    expect(lines.at(-1)).toContain("m visual")
    expect(lines.slice(0, -1).join("\n")).not.toContain("[Source]")
    await view.visual()
    await view.press("/")
    lines = view.captureCharFrame().trimEnd().split("\n")
    const footer = lines.at(-1)!
    expect(footer).toContain("click source")
    expect(footer).toContain("Esc close filter")
    expect(footer).toContain("copy")
    expect(footer).toContain("expand")
    expect(lines.slice(0, -1).join("\n")).not.toContain("[Visual]")
    expect(lines.slice(0, -1).join("\n")).not.toContain("Esc close filter")
    expect(view.controller.current?.isOpen()).toBe(true)
    await act(async () => {
      await view.mockMouse.click(footer.indexOf("source") + 1, lines.length - 1)
    })
    await view.render()
    expect(
      view.renderer.root.findDescendantById("response-visual-search"),
    ).toBeUndefined()
    expect(view.captureCharFrame().trimEnd().split("\n").at(-1)).toContain(
      "m visual",
    )
  })
  it("restores manual expansion after clearing search and keeps the filter across view switches", async () => {
    const view = await mount('{"nested":{"name":"Alice"},"other":2}')
    await view.visual()
    expect(view.captureCharFrame()).not.toContain("Alice")
    await view.search("Alice")
    expect(view.captureCharFrame()).toContain("Alice")
    const nested = view.renderer.root.findDescendantById("visual-node-1")!
    await act(async () => {
      await view.mockMouse.click(nested.x + 1, nested.y)
    })
    await view.render()
    expect(view.captureCharFrame()).not.toMatch(/VALUE\s+name\s+"Alice"/)
    await view.visual()
    await view.visual()
    expect(view.captureCharFrame()).toContain("Alice")
    expect(view.captureCharFrame()).not.toMatch(/VALUE\s+name\s+"Alice"/)
    jest.useFakeTimers()
    await act(async () => {
      for (let index = 0; index < 5; index++)
        await view.mockInput.pressKeys(["BACKSPACE"])
    })
    await act(async () => {
      jest.advanceTimersByTime(150)
    })
    jest.useRealTimers()
    await view.render()
    expect(view.captureCharFrame()).not.toContain("Alice")
    expect(view.captureCharFrame()).toContain("nested")
  })

  it("leaves modified Enter and focus keys to application bindings while search is focused", async () => {
    const view = await mount('{"name":"Alice"}')
    await view.visual()
    await view.press("/")
    let sends = 0
    let tabs = 0
    view.keymap.registerLayer({
      commands: [
        {
          name: "test.send",
          run: () => {
            sends++
          },
        },
        {
          name: "test.tab",
          run: () => {
            tabs++
          },
        },
      ],
      bindings: [
        { key: "ctrl+return", cmd: "test.send" },
        { key: "tab", cmd: "test.tab" },
      ],
    })
    await view.press("return", { ctrl: true })
    await view.press("tab")
    expect(sends).toBe(1)
    expect(tabs).toBe(1)
    expect(view.controller.current?.isOpen()).toBe(true)
  })

  it("renders aligned accordion names and muted previews, including wide characters", async () => {
    const view = await mount('{"界界":"Al","name":"Beatrice","note":"ok"}')
    await view.visual()
    expect(view.captureCharFrame()).toContain('VALUE   界界  "Al"')
    expect(view.captureCharFrame()).toContain('VALUE   name  "Beatrice"')
    expect(view.captureCharFrame()).toContain('VALUE   note  "ok"')
  })

  it("aligns sibling preview fields by terminal width", async () => {
    const view = await mount(
      JSON.stringify([
        { id: 1, name: "Al", username: "short" },
        { id: 10, name: "長い名前", username: "wide" },
        { id: 100, name: "Patricia Lebsack", username: "long" },
      ]),
      140,
    )
    await view.visual()
    await act(async () => {
      await view.waitForVisualIdle()
    })
    const lines = view
      .captureCharFrame()
      .split("\n")
      .filter((line) => line.includes("username:"))
    expect(lines).toHaveLength(3)
    for (const field of ["name:", "username:"]) {
      const offsets = lines.map((line) =>
        Bun.stringWidth(line.slice(0, line.indexOf(field))),
      )
      expect(new Set(offsets).size).toBe(1)
    }
    expect(lines[0]).toContain('name: "Al"')
    expect(lines[1]).toContain('name: "長い名前"')
    expect(lines[2]).toContain('name: "Patricia Lebsack"')
  })

  it("gives long preview fields the remaining space and adapts on resize", async () => {
    const name = "x".repeat(65) + "END"
    const view = await mount(
      JSON.stringify([
        { postId: 1, id: 1, name },
        { postId: 10, id: 100, name: "short" },
      ]),
      140,
    )
    await view.visual()
    const settle = async () => {
      await act(async () => {
        await view.waitForVisualIdle()
      })
      await view.render()
    }
    await settle()
    expect(view.captureCharFrame()).toContain(name)
    await act(async () => {
      view.resize(80, 20)
    })
    await settle()
    const lines = view
      .captureCharFrame()
      .split("\n")
      .filter((line) => line.includes("postId:"))
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain("…")
    expect(lines[0]).not.toContain("END")
    expect(lines[1]).toContain('name: "short"')
    expect(lines[0]!.indexOf("name:")).toBe(lines[1]!.indexOf("name:"))
    expect(lines[0]).toContain("x".repeat(20))
    await act(async () => {
      view.resize(140, 20)
    })
    await settle()
    expect(view.captureCharFrame()).toContain(name)
  })

  it("finds matches beyond truncated previews in large heterogeneous lists", async () => {
    const view = await mount(
      JSON.stringify(
        Array.from({ length: 1000 }, (_, index) => ({
          [`field-${index}`]:
            index === 999 ? "x".repeat(10000) + "needle" : index,
        })),
      ),
    )
    await view.visual()
    const scroll = view.renderer.root.findDescendantById(
      "response-visual-scroll",
    ) as ScrollBoxRenderable
    expect(scroll.scrollWidth).toBeLessThan(90)
    await view.search("needle")
    expect(view.captureCharFrame()).toContain("(1/1000)")
    expect(view.captureCharFrame()).toContain("needle")
  })

  for (const layout of ["stacked", "side-by-side"] as const) {
    it(`keeps the ${layout} Visual layout free of scrollbar artifacts while toggling the sidebar`, async () => {
      const raw = createTestKeymap()
      const keymap = raw.keymap as unknown as Keymap<Renderable, KeyEvent>
      keymap.setData("app.overlay", "none")
      const controller = { current: null as ResponseQueryController | null }
      const body = JSON.stringify({
        total: 2,
        users: [
          { id: 1, name: "Alice", address: { city: "Santiago" } },
          { id: 2, name: "Bob", role: "admin" },
        ],
      })
      const draft = {
        draft: {
          id: "users",
          name: "Get users",
          method: "GET",
          url: "https://example.com/users",
          headers: {},
          params: [],
          auth: { type: "none" },
        },
        dirtyRequestIds: new Set(),
      } as unknown as UseRequestDraftResult
      const eb = {
        editState: initialEditState(),
        editKey: "",
        editValue: "",
        activeTab: "headers",
      } as unknown as UseEditBrowseResult
      let toggleSidebar!: () => void
      registerDefaultKeys(keymap)
      registerEnabledFields(keymap)
      keymap.registerLayer({
        commands: [{ name: "sidebar.toggle", run: () => toggleSidebar() }],
        bindings: [{ key: "ctrl+b", cmd: "sidebar.toggle" }],
      })
      function Harness() {
        const [sidebarVisible, setSidebarVisible] = useState(true)
        const [focus, setFocus] = useState<Focus>("response")
        toggleSidebar = () =>
          toggleSidebarVisible(
            {
              sidebarVisibleRef: { current: sidebarVisible },
              focusRef: { current: focus },
              folderViewRef: { current: false },
            } as CommandActionsConfig,
            setFocus,
            setSidebarVisible,
          )
        return (
          <KeymapProvider keymap={keymap}>
            <box height="100%" flexDirection="column">
              <MainView
                collectionDir="/tmp/noodle-sidebar-test"
                keybinds={bindingDefaults()}
                onInitialize={() => {}}
                onCreateRequest={() => {}}
                onCollectionErrorSaved={() => {}}
                items={[{ type: "request", data: draft.draft! }]}
                loading={false}
                visibleItems={[]}
                cursorIndex={0}
                selectedId="users"
                expandedFolders={new Set()}
                focusedFolderPresent={false}
                folderDraft={
                  { dirtyPaths: new Set() } as Parameters<
                    typeof MainView
                  >[0]["folderDraft"]
                }
                folderEb={{} as Parameters<typeof MainView>[0]["folderEb"]}
                sidebarVisible={sidebarVisible}
                draft={draft}
                eb={eb}
                error={null}
                focus={focus}
                layout={layout}
                expanded={null}
                activeEnv={null}
                responseState={{
                  status: "done",
                  response: {
                    status: 200,
                    statusText: "OK",
                    headers: {},
                    body,
                    timeMs: 14,
                  },
                }}
                timelineEntries={[]}
                onResponseTabChange={() => {}}
                setSelectOpen={() => {}}
                urlbarSubFocus="text"
                urlbarInteractive
                responseQueryRef={controller}
              />
            </box>
          </KeymapProvider>
        )
      }
      const view = await testRender(<Harness />, { width: 150, height: 36 })
      await act(async () => {
        await view.renderOnce()
      })
      await act(async () => {
        controller.current?.toggleView?.()
      })
      await act(async () => {
        await view.renderOnce()
      })
      expect(view.renderer.getCursorState().visible).toBe(false)
      const toggleFrames: string[] = []
      const recordFrame = () => {
        toggleFrames.push(view.captureCharFrame())
      }
      view.renderer.on("frame", recordFrame)
      for (let index = 0; index < 4; index++) {
        await act(async () => {
          raw.host.press("b", { ctrl: true })
        })
        await act(async () => {
          await view.waitForVisualIdle()
        })
        await act(async () => {
          await view.renderOnce()
        })
        const scroll = view.renderer.root.findDescendantById(
          "response-visual-scroll",
        ) as ScrollBoxRenderable
        expect(scroll.verticalScrollBar.visible).toBe(false)
        expect(scroll.horizontalScrollBar.visible).toBe(false)
        expect(view.captureCharFrame()).not.toMatch(/[█▀▄▌▐]/)
        expect(view.renderer.getCursorState().visible).toBe(false)
        expect(view.captureCharFrame()).toContain("Response")
        expect(view.captureCharFrame()).toContain("users")
      }
      view.renderer.off("frame", recordFrame)
      expect(toggleFrames.length).toBeGreaterThan(0)
      for (const frame of toggleFrames) expect(frame).not.toMatch(/[█▀▄▌▐]/)
      await act(async () => {
        controller.current?.open()
      })
      await act(async () => {
        await view.renderOnce()
      })
      jest.useFakeTimers()
      await act(async () => {
        await view.mockInput.typeText("Santiago")
      })
      await act(async () => {
        jest.advanceTimersByTime(150)
      })
      jest.useRealTimers()
      await act(async () => {
        await view.renderOnce()
      })
      expect(
        view.renderer.root.findDescendantById("response-visual-search"),
      ).toBeDefined()
      expect(view.captureCharFrame()).toContain("Santiago")
      expect(view.captureCharFrame()).toContain("(1/2)")
      if (process.env.NOODLE_VISUAL_QA_DIR) {
        await act(async () => {
          await view.waitForVisualIdle()
        })
        await Bun.write(
          `${process.env.NOODLE_VISUAL_QA_DIR}/${layout}.txt`,
          view.captureCharFrame(),
        )
        await Bun.write(
          `${process.env.NOODLE_VISUAL_QA_DIR}/${layout}.json`,
          JSON.stringify(view.captureSpans()),
        )
      }
    })
  }

  it("opens search on demand, keeps Enter in the input, and clears the filter with Escape", async () => {
    const body = JSON.stringify([
      { id: 1, name: "Alice", address: { city: "Santiago" } },
      { id: 2, name: "Bob", role: "admin" },
    ])
    const view = await mount(body)
    expect(
      view.renderer.root.findDescendantById("response-body-editor"),
    ).toBeDefined()
    await view.visual()
    expect(
      view.renderer.root.findDescendantById("response-visual-search"),
    ).toBeUndefined()
    expect(view.controller.current?.isOpen()).toBe(false)
    await view.press("/")
    expect(
      view.renderer.root.findDescendantById("response-visual-search"),
    ).toBeDefined()
    expect(view.renderer.currentFocusedRenderable?.id).toBe(
      "response-visual-search",
    )
    expect(view.controller.current?.isOpen()).toBe(true)
    expect(view.captureCharFrame()).toContain("Alice")
    expect(view.captureCharFrame()).toContain("Bob")
    await view.search("SANTIAGO")
    const frame = view.captureCharFrame()
    expect(frame).toContain("(1/2)")
    expect(frame).toContain("Alice")
    expect(frame).not.toContain("Bob")
    expect(frame).toContain("Santiago")
    expect(view.copy.current).toBe(body)
    await view.press("return")
    expect(view.controller.current?.isOpen()).toBe(true)
    expect(view.renderer.currentFocusedRenderable?.id).toBe(
      "response-visual-search",
    )
    expect(view.captureCharFrame()).toContain("SANTIAGO")
    await act(async () => {
      view.controller.current?.open()
    })
    await view.render()
    expect(view.renderer.currentFocusedRenderable?.id).toBe(
      "response-visual-search",
    )
    await view.press("escape")
    expect(view.captureCharFrame()).not.toContain("SANTIAGO")
    expect(view.captureCharFrame()).toContain("Bob")
    expect(
      view.renderer.root.findDescendantById("response-visual-search"),
    ).toBeUndefined()
    expect(view.controller.current?.isOpen()).toBe(false)
    await view.visual()
    expect(
      view.renderer.root.findDescendantById("response-body-editor"),
    ).toBeDefined()
  })

  it("renders narrow records as fields and supports mouse expansion and full long values", async () => {
    const view = await mount(
      '[{"name":"Alice","long":"' + "x".repeat(150) + 'END"}]',
      45,
      16,
    )
    await view.visual()
    await view.press("down")
    await view.press("return")
    expect(view.captureCharFrame()).toMatch(/VALUE\s+name\s+"Alice"/)
    const name = view.renderer.root.findDescendantById("visual-node-2")
    expect(name).toBeDefined()
    if (!name) throw new Error("Missing name row")
    await act(async () => {
      await view.mockMouse.click(name.x + 1, name.y)
    })
    await view.render()
    await view.press("down")
    await view.press("return")
    const scroll = view.renderer.root.findDescendantById(
      "response-visual-scroll",
    ) as ScrollBoxRenderable
    expect(scroll.scrollWidth).toBeGreaterThan(150)
    await act(async () => {
      scroll.scrollTo({ x: scroll.scrollWidth, y: 0 })
    })
    await view.render()
    expect(view.captureCharFrame()).toContain("END")
  })

  it("keeps mounting bounded while scrolling a large list and responds to resizing", async () => {
    const view = await mount(
      JSON.stringify(
        Array.from({ length: 10000 }, (_, id) => ({
          id,
          name: `record-${id}`,
        })),
      ),
      90,
      18,
    )
    await view.visual()
    await view.press("end")
    expect(view.captureCharFrame()).toContain("record-9999")
    const scroll = view.renderer.root.findDescendantById(
      "response-visual-scroll",
    ) as ScrollBoxRenderable
    const rows = scroll.getChildren()[0]!.getChildren()
    expect(rows.length).toBeLessThan(30)
    await act(async () => {
      scroll.scrollTo(4000)
    })
    await view.render()
    expect(view.captureCharFrame()).toContain("record-3999")
    await act(async () => {
      view.resize(42, 18)
    })
    await act(async () => {
      await view.waitForFrame(
        (frame) =>
          frame.split("\n")[0]!.trimEnd().length <= 42 &&
          frame.includes("[3999]"),
      )
    })
    await view.render()
    expect(view.captureCharFrame()).toContain("[3999]")
    expect(scroll.width).toBeLessThan(42)
  })

  it("resets filters for a new response, retains Visual, and isolates focus and overlays", async () => {
    const view = await mount('{"outer":{"name":"Alice"}}')
    await view.visual()
    await view.search("absent")
    expect(view.captureCharFrame()).toContain("No matches")
    await act(async () => {
      view.replace('{"name":"Bob"}')
    })
    await view.render()
    expect(
      view.renderer.root.findDescendantById("response-visual-search"),
    ).toBeUndefined()
    expect(view.captureCharFrame()).toContain("Bob")
    expect(view.captureCharFrame()).not.toContain("absent")
    await view.press("/")
    await act(async () => {
      view.focus(false)
    })
    await view.render()
    expect(view.controller.current?.isOpen()).toBe(false)
    await act(async () => {
      view.focus(true)
    })
    await view.render()
    view.keymap.setData("app.overlay", "help")
    await view.press("escape")
    view.keymap.setData("app.overlay", "none")
    expect(view.controller.current?.isOpen()).toBe(true)
    await act(async () => {
      view.tab("headers")
    })
    await view.render()
    expect(view.controller.current?.canToggleView?.()).toBe(false)
    expect(view.controller.current?.isOpen()).toBe(false)
  })

  it("shows XML structures and explicit invalid and empty states", async () => {
    const view = await mount(
      '<r><item id="1">One</item><item id="2">Two</item></r>',
    )
    await view.visual()
    await view.search("Two")
    expect(view.captureCharFrame()).toContain("(1/2)")
    expect(view.captureCharFrame()).toContain("@id")
    expect(view.captureCharFrame()).toContain("Two")
    await act(async () => {
      view.replace("not JSON or XML")
    })
    await view.render()
    expect(view.captureCharFrame()).toContain("Cannot visualize")
    await act(async () => {
      view.replace("")
    })
    await view.render()
    expect(view.captureCharFrame()).toContain("(no body)")
  })

  it("keeps the large body gate ahead of visual parsing", async () => {
    const view = await mount('"' + "x".repeat(5 * 1024 * 1024) + '"')
    await view.visual()
    expect(view.captureCharFrame()).toContain("not rendered automatically")
    expect(view.captureCharFrame()).toContain("v view body")
    expect(view.captureCharFrame()).not.toContain("ctrl+b copy")
    expect(
      view.renderer.root.findDescendantById("response-visual-search"),
    ).toBeUndefined()
    expect(view.copy.current?.length).toBeGreaterThan(5 * 1024 * 1024)
  })
})
