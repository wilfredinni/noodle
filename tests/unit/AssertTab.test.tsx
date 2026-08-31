import { describe, expect, it } from "bun:test"
import { RGBA, ScrollBoxRenderable, type BoxRenderable } from "@opentui/core"
import { MouseButtons } from "@opentui/core/testing"
import { act, useState } from "react"
import { createTestKeymap } from "@opentui/keymap/testing"
import {
  registerDefaultKeys,
  registerEnabledFields,
} from "@opentui/keymap/addons"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestRender } from "../testRender"
import { ThemeProvider, THEMES } from "../../src/ui/theme"
import { AssertTab } from "../../src/ui/request-pane/AssertTab"
import { VariableCompletionInterceptor } from "../../src/ui/variable-completion/variableCompletionInterceptor"
import type { AssertionOperator, Request } from "../../src/schema"
import type { EditState } from "../../src/ui/editMode"
import { createResponseExpressionCompleter } from "../../src/response"

const testRender = createTestRender()
const request: Request = {
  id: "assertions",
  name: "Assertions",
  method: "GET",
  url: "https://example.com",
  headers: {},
  params: [],
  timeout: 0,
  assertions: [{ expression: "body.id", operator: "equals", value: 42 }],
}
const tableRequest: Request = {
  ...request,
  assertions: [
    { expression: "status", operator: "equals", value: 200 },
    { expression: "body.id", operator: "exists" },
  ],
}

function setup() {
  const { keymap, host, cleanup: cleanupHost } = createTestKeymap()
  const cleanupEnabled = registerEnabledFields(keymap)
  const cleanupKeys = registerDefaultKeys(keymap)
  keymap.setData("app.overlay", "none")
  return {
    keymap,
    host,
    cleanup: () => {
      cleanupEnabled()
      cleanupKeys()
      cleanupHost()
    },
  }
}

describe("AssertTab", () => {
  it("switches canonical operators and hides an unused expected value", async () => {
    const { keymap, host, cleanup } = setup()
    function Harness() {
      const [operator, setOperator] = useState<AssertionOperator>("equals")
      return (
        <KeymapProvider
          keymap={
            keymap as unknown as Parameters<typeof KeymapProvider>[0]["keymap"]
          }
        >
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <AssertTab
              request={request}
              editState={{
                mode: "editing",
                cursor: {
                  field: "assertions",
                  row: 0,
                  addingRow: false,
                  subfield: "operator",
                },
                editingRow: 0,
              }}
              editKey="body.id"
              editValue="42"
              editOperator={operator}
              editError={null}
              setEditKey={() => {}}
              setEditValue={() => {}}
              setEditOperator={setOperator}
            />
          </ThemeProvider>
        </KeymapProvider>
      )
    }
    const render = await testRender(<Harness />, { width: 58, height: 12 })
    await render.renderOnce()
    expect(render.captureCharFrame()).toContain("equals")
    expect(render.captureCharFrame()).toContain("42")
    await act(async () => host.press("return"))
    await act(async () => host.press("up"))
    await act(async () => host.press("return"))
    await render.renderOnce()
    expect(render.captureCharFrame()).toContain("notNull")
    expect(render.captureCharFrame()).not.toContain("42")
    cleanup()
  })

  it("uses aligned columns and shared add-row mouse interactions", async () => {
    const { keymap, cleanup } = setup()
    const activations: Array<
      [number, boolean, "key" | "operator" | "value" | undefined]
    > = []
    const toggles: number[] = []
    try {
      const render = await testRender(
        <KeymapProvider
          keymap={
            keymap as unknown as Parameters<typeof KeymapProvider>[0]["keymap"]
          }
        >
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <AssertTab
              request={tableRequest}
              editState={{
                mode: "inactive",
                cursor: { field: "assertions", row: 0, addingRow: false },
                editingRow: -1,
              }}
              editKey=""
              editValue=""
              editOperator="equals"
              editError={null}
              setEditKey={() => {}}
              setEditValue={() => {}}
              setEditOperator={() => {}}
              onActivateRow={(row, addingRow, subfield) =>
                activations.push([row, addingRow, subfield])
              }
              onToggleRow={(row) => toggles.push(row)}
            />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 80, height: 8 },
      )
      await render.renderOnce()

      const frame = render.captureCharFrame()
      expect(frame).toContain("Response expression...")
      expect(frame).toContain("Expected...")
      expect(frame).toContain("▼    200")
      expect(frame).toContain("[x]")
      expect(frame).not.toContain("+ Add assertion")

      const first = render.renderer.root.findDescendantById(
        "assertions-0",
      ) as BoxRenderable
      const valueLess = render.renderer.root.findDescendantById(
        "assertions-1",
      ) as BoxRenderable
      const add = render.renderer.root.findDescendantById(
        "assertions-add",
      ) as BoxRenderable
      const firstCells = first.getChildren() as BoxRenderable[]
      const valueLessCells = valueLess.getChildren() as BoxRenderable[]
      const addCells = add.getChildren() as BoxRenderable[]

      expect(
        first.backgroundColor.equals(
          RGBA.fromHex(THEMES[0]!.backgroundElement),
        ),
      ).toBe(false)
      expect(
        Math.abs(
          firstCells[2]!.x +
            firstCells[2]!.width / 2 -
            (first.x +
              firstCells[0]!.width +
              (first.width - firstCells[0]!.width) / 2),
        ),
      ).toBeLessThanOrEqual(0.5)
      expect(firstCells[3]!.x).toBe(valueLessCells[3]!.x)
      expect(firstCells[3]!.width).toBe(valueLessCells[3]!.width)
      expect(valueLessCells[3]!.getChildren()).toHaveLength(0)

      await act(async () => {
        await render.mockMouse.moveTo(first.x + 1, first.y)
      })
      await act(async () => {
        await render.renderOnce()
      })
      const hoveredFirst = render.renderer.root.findDescendantById(
        "assertions-0",
      ) as BoxRenderable
      expect(
        hoveredFirst.backgroundColor.equals(
          RGBA.fromHex(THEMES[0]!.backgroundElement),
        ),
      ).toBe(true)

      await act(async () => {
        await render.mockMouse.click(
          firstCells[0]!.x + 1,
          firstCells[0]!.y,
          MouseButtons.LEFT,
        )
      })
      for (const cell of firstCells.slice(1)) {
        await act(async () => {
          await render.mockMouse.click(cell.x + 1, cell.y, MouseButtons.LEFT)
        })
      }
      for (const cell of addCells.slice(1)) {
        await act(async () => {
          await render.mockMouse.click(cell.x + 1, cell.y, MouseButtons.LEFT)
        })
      }

      expect(activations).toEqual([
        [0, false, "key"],
        [0, false, "operator"],
        [0, false, "value"],
        [-1, true, "key"],
        [-1, true, "operator"],
        [-1, true, "value"],
      ])
      expect(toggles).toEqual([0])
    } finally {
      cleanup()
    }
  })

  it("uses the normal select surface and opens with one mouse click", async () => {
    const { keymap, host, cleanup } = setup()
    function Harness() {
      const [operator, setOperator] = useState<AssertionOperator>("exists")
      const [editState, setEditState] = useState<EditState>({
        mode: "inactive",
        cursor: { field: "assertions", row: 0, addingRow: false },
        editingRow: -1,
      })
      return (
        <KeymapProvider
          keymap={
            keymap as unknown as Parameters<typeof KeymapProvider>[0]["keymap"]
          }
        >
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <AssertTab
              request={tableRequest}
              editState={editState}
              editKey="body.id"
              editValue=""
              editOperator={operator}
              editError={null}
              setEditKey={() => {}}
              setEditValue={() => {}}
              setEditOperator={setOperator}
              onActivateRow={(row, addingRow, subfield) => {
                setEditState({
                  mode: "editing",
                  cursor: { field: "assertions", row, addingRow, subfield },
                  editingRow: row,
                })
              }}
            />
          </ThemeProvider>
        </KeymapProvider>
      )
    }
    try {
      const render = await testRender(<Harness />, { width: 80, height: 20 })
      await render.renderOnce()

      const row = render.renderer.root.findDescendantById(
        "assertions-1",
      ) as BoxRenderable
      const operatorCell = row.getChildren()[2] as BoxRenderable
      const select = operatorCell.getChildren()[0] as BoxRenderable
      const relative = select.getChildren()[0] as BoxRenderable
      const trigger = relative.getChildren()[0] as BoxRenderable
      expect(
        trigger.backgroundColor.equals(
          RGBA.fromHex(THEMES[0]!.backgroundElement),
        ),
      ).toBe(true)

      await act(async () => {
        await render.mockMouse.click(
          trigger.x + 1,
          trigger.y,
          MouseButtons.LEFT,
        )
        await render.renderOnce()
      })
      await act(async () => render.renderOnce())

      const dropdown = render.renderer.root.getChildren().at(-1)
      const scrollbox = dropdown?.getChildren()[0]
      expect(scrollbox).toBeInstanceOf(ScrollBoxRenderable)
      const operatorScrollbox = scrollbox as ScrollBoxRenderable
      expect(operatorScrollbox.height).toBe(10)
      expect(operatorScrollbox.verticalScrollBar.visible).toBe(true)
      expect(
        operatorScrollbox.verticalScrollBar.slider.backgroundColor.equals(
          RGBA.fromHex(THEMES[0]!.background),
        ),
      ).toBe(true)
      expect(
        operatorScrollbox.verticalScrollBar.slider.foregroundColor.equals(
          RGBA.fromHex(THEMES[0]!.borderActive),
        ),
      ).toBe(true)
      expect(render.captureCharFrame()).not.toContain("notEquals")

      await act(async () => {
        for (let i = 0; i < 10; i++) host.press("down")
        await render.renderOnce()
      })
      await act(async () => render.renderOnce())
      expect(operatorScrollbox.scrollTop).toBeGreaterThan(0)
      expect(render.captureCharFrame()).toContain("notEquals")

      await act(async () => {
        host.press("return")
        await render.renderOnce()
      })
      expect(render.captureCharFrame()).toContain("notEquals")
    } finally {
      cleanup()
    }
  })

  it("renders disabled assertion rows unchecked and muted", async () => {
    const { keymap, cleanup } = setup()
    try {
      const render = await testRender(
        <KeymapProvider
          keymap={
            keymap as unknown as Parameters<typeof KeymapProvider>[0]["keymap"]
          }
        >
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <AssertTab
              request={{
                ...request,
                assertions: [
                  {
                    expression: "body.disabled",
                    operator: "exists",
                    enabled: false,
                  },
                ],
              }}
              editState={{
                mode: "inactive",
                cursor: { field: "assertions", row: 0, addingRow: false },
                editingRow: -1,
              }}
              editKey=""
              editValue=""
              editOperator="equals"
              editError={null}
              setEditKey={() => {}}
              setEditValue={() => {}}
              setEditOperator={() => {}}
            />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 70, height: 5 },
      )
      await render.renderOnce()
      expect(render.captureCharFrame()).toContain("[ ]")
      const muted = RGBA.fromHex(THEMES[0]!.textMuted)
      const spans = render.captureSpans().lines.flatMap((line) => line.spans)
      expect(
        spans
          .find((span) => span.text.includes("body.disabled"))!
          .fg.equals(muted),
      ).toBe(true)
      expect(
        spans.find((span) => span.text.includes("exists"))!.fg.equals(muted),
      ).toBe(true)
    } finally {
      cleanup()
    }
  })

  it("does not toggle rows when interaction is disabled", async () => {
    const { keymap, cleanup } = setup()
    const toggles: number[] = []
    try {
      const render = await testRender(
        <KeymapProvider
          keymap={
            keymap as unknown as Parameters<typeof KeymapProvider>[0]["keymap"]
          }
        >
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <AssertTab
              request={tableRequest}
              editState={{
                mode: "browsing",
                cursor: { field: "assertions", row: 0, addingRow: false },
                editingRow: -1,
              }}
              editKey=""
              editValue=""
              editOperator="equals"
              editError={null}
              setEditKey={() => {}}
              setEditValue={() => {}}
              setEditOperator={() => {}}
              onToggleRow={(row) => toggles.push(row)}
              interactive={false}
            />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 80, height: 8 },
      )
      await render.renderOnce()
      const row = render.renderer.root.findDescendantById(
        "assertions-0",
      ) as BoxRenderable
      const toggle = row.getChildren()[0] as BoxRenderable
      await act(async () => {
        await render.mockMouse.click(toggle.x + 1, toggle.y, MouseButtons.LEFT)
      })

      expect(toggles).toEqual([])
    } finally {
      cleanup()
    }
  })

  it("shows a concise expression label and accepts its full value", async () => {
    const { keymap, host, cleanup } = setup()
    const complete = createResponseExpressionCompleter({
      headers: {},
      body: '{"user":{"profile":{"name":"Noodle"}}}',
    })
    let selected = ""
    function Harness() {
      const [key, setKey] = useState("body.user.")
      selected = key
      return (
        <KeymapProvider
          keymap={
            keymap as unknown as Parameters<typeof KeymapProvider>[0]["keymap"]
          }
        >
          <VariableCompletionInterceptor />
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <AssertTab
              request={request}
              completionValues={complete(key)}
              editState={{
                mode: "editing",
                cursor: {
                  field: "assertions",
                  row: 0,
                  addingRow: false,
                  subfield: "key",
                },
                editingRow: 0,
              }}
              editKey={key}
              editValue="42"
              editOperator="equals"
              editError={null}
              setEditKey={setKey}
              setEditValue={() => {}}
              setEditOperator={() => {}}
            />
          </ThemeProvider>
        </KeymapProvider>
      )
    }
    try {
      const render = await testRender(<Harness />, { width: 40, height: 12 })
      await render.renderOnce()
      await act(async () => render.renderOnce())
      expect(render.captureCharFrame()).toContain("profile")
      await act(async () => host.press("return"))
      await render.renderOnce()
      expect(selected).toBe("body.user.profile")
    } finally {
      cleanup()
    }
  })

  it("renders shared validation errors inline", async () => {
    const { keymap, cleanup } = setup()
    const render = await testRender(
      <KeymapProvider
        keymap={
          keymap as unknown as Parameters<typeof KeymapProvider>[0]["keymap"]
        }
      >
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <AssertTab
            request={request}
            editState={{
              mode: "editing",
              cursor: {
                field: "assertions",
                row: 0,
                addingRow: false,
                subfield: "key",
              },
              editingRow: 0,
            }}
            editKey="body["
            editValue="42"
            editOperator="equals"
            editError="Invalid response expression"
            setEditKey={() => {}}
            setEditValue={() => {}}
            setEditOperator={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 40, height: 8 },
    )
    await render.renderOnce()
    expect(render.captureCharFrame()).toContain("Invalid response expression")
    cleanup()
  })
})
