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
import { RequestResponseView } from "../../src/ui/RequestResponseView"
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

async function mount(body: string, width = 90, height = 20) {
  const raw = createTestKeymap()
  const keymap = raw.keymap as unknown as Keymap<Renderable, KeyEvent>
  keymap.setData("app.overlay", "none")
  registerDefaultKeys(keymap)
  registerEnabledFields(keymap)
  const controller = { current: null as ResponseQueryController | null }
  const copy = { current: null as string | null }
  let replace!: (body: string) => void
  let focus!: (focused: boolean) => void
  let tab!: (tab: "body" | "headers") => void
  function Harness() {
    const [value, setValue] = useState(body)
    const [focused, setFocused] = useState(true)
    const [activeTab, setTab] = useState<"body" | "headers">("body")
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
        <ResponsePane
          state={state}
          focused={focused}
          initialTab={activeTab}
          responseQueryRef={controller}
          responseBodyForCopyRef={copy}
        />
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
  it("restores manual expansion after clearing search and keeps the filter across view switches", async () => {
    const view = await mount('{"nested":{"name":"Alice"},"other":2}')
    await view.visual()
    expect(view.captureCharFrame()).not.toContain("Alice")
    await view.search("Alice")
    expect(view.captureCharFrame()).toContain("Alice")
    await view.press("return")
    await view.press("down")
    await view.press("return")
    expect(view.captureCharFrame()).not.toContain('name: "Alice"')
    await view.visual()
    await view.visual()
    expect(view.captureCharFrame()).toContain("Search Alice")
    expect(view.captureCharFrame()).not.toContain('name: "Alice"')
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

  it("finds matches beyond truncated previews and windows very wide sparse tables", async () => {
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
    expect(scroll.scrollWidth).toBeGreaterThan(20000)
    await view.search("needle")
    expect(view.captureCharFrame()).toContain("(1/1000)")
    expect(view.captureCharFrame()).toContain("needle")
  })

  for (const layout of ["stacked", "side-by-side"] as const) {
    it(`renders the visualization in the actual ${layout} request/response layout`, async () => {
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
      const view = await testRender(
        <KeymapProvider keymap={keymap}>
          <box height="100%" flexDirection="column">
            <RequestResponseView
              draft={draft}
              eb={eb}
              error={null}
              focus="response"
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
              urlbarInteractive={false}
              responseQueryRef={controller}
            />
          </box>
        </KeymapProvider>,
        { width: 150, height: 36 },
      )
      await act(async () => {
        await view.renderOnce()
      })
      await act(async () => {
        controller.current?.toggleView?.()
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
      expect(view.captureCharFrame()).toContain("[Visual]")
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

  it("opens from Source with search focused, filters whole records, and copies the original body", async () => {
    const body = JSON.stringify([
      { id: 1, name: "Alice", address: { city: "Santiago" } },
      { id: 2, name: "Bob", role: "admin" },
    ])
    const view = await mount(body)
    expect(view.captureCharFrame()).toContain("[Source]")
    await view.visual()
    expect(view.captureCharFrame()).toContain("[Visual]")
    expect(view.renderer.currentFocusedRenderable?.id).toBe(
      "response-visual-search",
    )
    expect(view.controller.current?.isOpen()).toBe(true)
    expect(view.captureCharFrame()).toContain("Alice")
    expect(view.captureCharFrame()).toContain("(missing)")
    await view.search("SANTIAGO")
    const frame = view.captureCharFrame()
    expect(frame).toContain("(1/2)")
    expect(frame).toContain("Alice")
    expect(frame).not.toContain("Bob")
    expect(frame).toContain("Santiago")
    expect(view.copy.current).toBe(body)
    await view.press("return")
    expect(view.controller.current?.isOpen()).toBe(false)
    expect(view.captureCharFrame()).toContain("SANTIAGO")
    await act(async () => {
      view.controller.current?.open()
    })
    await view.render()
    expect(view.renderer.currentFocusedRenderable?.id).toBe(
      "response-visual-search",
    )
    await view.press("escape")
    expect(view.captureCharFrame()).toContain("SANTIAGO")
    await view.visual()
    expect(view.captureCharFrame()).toContain("[Source]")
  })

  it("renders narrow records as fields and supports mouse expansion and full long values", async () => {
    const view = await mount(
      '[{"name":"Alice","long":"' + "x".repeat(150) + 'END"}]',
      45,
      16,
    )
    await view.visual()
    await view.press("return")
    await view.press("down")
    await view.press("return")
    expect(view.captureCharFrame()).toContain('name: "Alice"')
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

  it("keeps mounting bounded while scrolling a large table and responds to resizing", async () => {
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
    await view.press("return")
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
    expect(view.captureCharFrame()).toContain("record-3998")
    await act(async () => {
      view.resize(42, 18)
    })
    await act(async () => {
      await view.waitForFrame((frame) => !frame.includes(" │ "))
    })
    expect(view.captureCharFrame()).not.toContain(" │ ")
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
    expect(view.captureCharFrame()).toContain("[Visual]")
    expect(view.captureCharFrame()).toContain("Bob")
    expect(view.captureCharFrame()).not.toContain("absent")
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
    expect(
      view.renderer.root.findDescendantById("response-visual-search"),
    ).toBeUndefined()
    expect(view.copy.current?.length).toBeGreaterThan(5 * 1024 * 1024)
  })
})
