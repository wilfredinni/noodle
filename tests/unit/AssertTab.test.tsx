import { describe, expect, it } from "bun:test"
import { RGBA, type BoxRenderable } from "@opentui/core"
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
    const tableRequest: Request = {
      ...request,
      assertions: [
        { expression: "status", operator: "equals", value: 200 },
        { expression: "body.id", operator: "exists" },
      ],
    }
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
                cursor: { field: "headers", row: -1, addingRow: false },
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
            />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 80, height: 8 },
      )
      await render.renderOnce()

      const frame = render.captureCharFrame()
      expect(frame).toContain("Response expression...")
      expect(frame).toContain("Expected...")
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

      expect(firstCells[2]!.x).toBe(valueLessCells[2]!.x)
      expect(firstCells[2]!.width).toBe(valueLessCells[2]!.width)
      expect(valueLessCells[2]!.getChildren()).toHaveLength(0)

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

      for (const cell of firstCells) {
        await act(async () => {
          await render.mockMouse.click(cell.x + 1, cell.y, MouseButtons.LEFT)
        })
      }
      for (const cell of addCells) {
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
    } finally {
      cleanup()
    }
  })

  it("offers response-expression completion at narrow widths", async () => {
    const { keymap, cleanup } = setup()
    const render = await testRender(
      <KeymapProvider
        keymap={
          keymap as unknown as Parameters<typeof KeymapProvider>[0]["keymap"]
        }
      >
        <VariableCompletionInterceptor />
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <AssertTab
            request={request}
            response={{
              status: 200,
              statusText: "OK",
              headers: { "x-request-id": "123" },
              body: '{"id":42}',
              timeMs: 4,
            }}
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
            editKey="bo"
            editValue="42"
            editOperator="equals"
            editError={null}
            setEditKey={() => {}}
            setEditValue={() => {}}
            setEditOperator={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 40, height: 12 },
    )
    await render.renderOnce()
    expect(
      render.renderer.root.findDescendantById("value-completion-menu"),
    ).not.toBeNull()
    cleanup()
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
