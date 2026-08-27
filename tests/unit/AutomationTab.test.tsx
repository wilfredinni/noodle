import { describe, expect, it } from "bun:test"
import { act, useState } from "react"
import { createTestKeymap } from "@opentui/keymap/testing"
import {
  registerDefaultKeys,
  registerEnabledFields,
} from "@opentui/keymap/addons"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestRender } from "../testRender"
import { ThemeProvider } from "../../src/ui/theme"
import { AutomationTab } from "../../src/ui/request-pane/AutomationTab"
import { VariableCompletionInterceptor } from "../../src/ui/variable-completion/variableCompletionInterceptor"
import type { AssertionOperator, Request } from "../../src/schema"
import type { BoxRenderable } from "@opentui/core"
import { MouseButtons } from "@opentui/core/testing"

const testRender = createTestRender()
const request: Request = {
  id: "automation",
  name: "Automation",
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

describe("AutomationTab", () => {
  it("keeps a later row targeted when an add row commits first", async () => {
    const { keymap, cleanup } = setup()
    const activated: Array<[number, string | undefined]> = []
    const render = await testRender(
      <KeymapProvider
        keymap={
          keymap as unknown as Parameters<typeof KeymapProvider>[0]["keymap"]
        }
      >
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <AutomationTab
            request={{ ...request, captures: { token: "body.token" } }}
            editState={{
              mode: "editing",
              cursor: {
                field: "automation",
                row: 0,
                addingRow: false,
                subfield: "key",
              },
              editingRow: 0,
            }}
            editKey="smoke"
            editValue=""
            editOperator="equals"
            editError={null}
            setEditKey={() => {}}
            setEditValue={() => {}}
            setEditOperator={() => {}}
            onActivateRow={(row, subfield) => activated.push([row, subfield])}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 58, height: 14 },
    )
    await render.renderOnce()
    const target = render.renderer.root.findDescendantById(
      "automation-1",
    ) as BoxRenderable
    await act(async () => {
      await render.mockMouse.click(target.x + 1, target.y, MouseButtons.LEFT)
    })
    expect(activated).toEqual([[2, "key"]])
    cleanup()
  })

  it("switches operators and hides the expected field using only keys", async () => {
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
            <AutomationTab
              request={request}
              editState={{
                mode: "editing",
                cursor: {
                  field: "automation",
                  row: 2,
                  addingRow: false,
                  subfield: "operator",
                },
                editingRow: 2,
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
    const render = await testRender(<Harness />, { width: 58, height: 14 })
    await render.renderOnce()
    expect(render.captureCharFrame()).toContain("equals ▼ 42")
    await act(async () => host.press("return"))
    await act(async () => host.press("up"))
    await act(async () => host.press("return"))
    await render.renderOnce()
    expect(render.captureCharFrame()).toContain("notNull")
    expect(render.captureCharFrame()).not.toContain("42")
    cleanup()
  })

  it("accepts response-expression completion from the keyboard", async () => {
    const { keymap, host, cleanup } = setup()
    function Harness() {
      const [expression, setExpression] = useState("bo")
      return (
        <KeymapProvider
          keymap={
            keymap as unknown as Parameters<typeof KeymapProvider>[0]["keymap"]
          }
        >
          <VariableCompletionInterceptor />
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <AutomationTab
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
                  field: "automation",
                  row: 2,
                  addingRow: false,
                  subfield: "key",
                },
                editingRow: 2,
              }}
              editKey={expression}
              editValue="42"
              editOperator="equals"
              editError={null}
              setEditKey={setExpression}
              setEditValue={() => {}}
              setEditOperator={() => {}}
            />
          </ThemeProvider>
        </KeymapProvider>
      )
    }
    const render = await testRender(<Harness />, { width: 58, height: 14 })
    await render.renderOnce()
    expect(
      render.renderer.root.findDescendantById("value-completion-menu"),
    ).not.toBeNull()
    await act(async () => host.press("return"))
    await render.renderOnce()
    expect(render.captureCharFrame()).toContain("body")
    expect(render.captureCharFrame()).not.toMatch(/\bbo\b/)
    cleanup()
  })

  it("shows shared validation errors inline", async () => {
    const { keymap, cleanup } = setup()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider
        keymap={
          keymap as unknown as Parameters<typeof KeymapProvider>[0]["keymap"]
        }
      >
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <AutomationTab
            request={request}
            editState={{
              mode: "editing",
              cursor: {
                field: "automation",
                row: 2,
                addingRow: false,
                subfield: "key",
              },
              editingRow: 2,
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
      { width: 40, height: 14 },
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("Invalid response expression")
    cleanup()
  })
})
