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
    expect(render.captureCharFrame()).toContain("equals ▼ 42")
    await act(async () => host.press("return"))
    await act(async () => host.press("up"))
    await act(async () => host.press("return"))
    await render.renderOnce()
    expect(render.captureCharFrame()).toContain("notNull")
    expect(render.captureCharFrame()).not.toContain("42")
    cleanup()
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
