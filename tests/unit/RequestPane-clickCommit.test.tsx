import { describe, expect, it } from "bun:test"
import { act, useState } from "react"
import { createTestRender } from "../testRender"
import { KeymapProvider } from "@opentui/keymap/react"
import type { BoxRenderable } from "@opentui/core"
import { MouseButtons } from "@opentui/core/testing"
import { ThemeProvider } from "../../src/ui/theme"
import { RequestPane } from "../../src/ui/RequestPane"
import type { FieldKind } from "../../src/ui/editMode"
import type { Request } from "../../src/schema"
import { setupKeymap } from "./_helpers"

const testRender = createTestRender()

const request: Request = {
  id: "photo",
  name: "Photo",
  method: "GET",
  url: "https://example.com/photos/:photoId",
  headers: {},
  params: [{ name: "include", value: "metadata", enabled: true }],
  pathParams: [{ name: "photoId", value: "42", enabled: true }],
  timeout: 0,
  followRedirects: true,
  maxRedirects: 5,
  auth: { type: "none" },
}

const automationRequest: Request = {
  ...request,
  assertions: [{ expression: "status", operator: "exists" }],
  captures: { token: { value: "body.token", enabled: true } },
}

const browsingHeaders = {
  mode: "browsing" as const,
  cursor: { field: "headers" as const, row: -1, addingRow: true },
  editingRow: -1,
}

function EditingPane({
  activeTab,
  onInteraction,
}: {
  activeTab: FieldKind
  onInteraction: () => void
}) {
  const isPath = activeTab === "pathParams"
  return (
    <RequestPane
      request={request}
      editState={{
        mode: "editing",
        cursor: {
          field: activeTab,
          row: 0,
          addingRow: false,
          subfield: "value",
        },
        editingRow: 0,
      }}
      editKey={isPath ? "photoId" : "include"}
      editValue={isPath ? "42" : "metadata"}
      setEditKey={() => {}}
      setEditValue={() => {}}
      activeTab={activeTab}
      onInteraction={onInteraction}
    />
  )
}

describe("RequestPane blank click commit", () => {
  it("hides empty optional tabs behind a compact add control", async () => {
    const { keymap, cleanup } = setupKeymap()
    try {
      const render = await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <RequestPane
              request={request}
              editState={browsingHeaders}
              editKey=""
              editValue=""
              setEditKey={() => {}}
              setEditValue={() => {}}
              activeTab="headers"
            />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 42, height: 12 },
      )

      await act(async () => {
        await render.renderOnce()
      })
      expect(
        render.renderer.root.findDescendantById("tab-assertions"),
      ).toBeUndefined()
      expect(
        render.renderer.root.findDescendantById("tab-captures"),
      ).toBeUndefined()
      const frame = render.captureCharFrame()
      expect(frame).toContain("+")
      expect(frame).not.toContain("▼")
    } finally {
      cleanup()
    }
  })

  it("adds an optional tab and hides it after switching away empty", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const changes: FieldKind[] = []

    function Harness() {
      const [activeTab, setActiveTab] = useState<FieldKind>("headers")
      return (
        <RequestPane
          request={request}
          editState={{
            mode: "browsing",
            cursor: { field: activeTab, row: -1, addingRow: true },
            editingRow: -1,
          }}
          editKey=""
          editValue=""
          setEditKey={() => {}}
          setEditValue={() => {}}
          activeTab={activeTab}
          onInteraction={() => true}
          onTabChange={(tab) => {
            changes.push(tab)
            setActiveTab(tab)
          }}
        />
      )
    }

    try {
      const render = await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <Harness />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 80, height: 16 },
      )

      await act(async () => {
        await render.renderOnce()
      })
      const lines = render.captureCharFrame().split("\n")
      const addRow = lines.findIndex((line) => line.includes("+"))
      const addColumn = lines[addRow]!.lastIndexOf("+")
      await act(async () => {
        await render.mockMouse.moveTo(addColumn, addRow)
      })
      await act(async () => {
        await render.renderOnce()
      })
      await act(async () => {
        await render.mockMouse.click(addColumn, addRow, MouseButtons.LEFT)
      })
      await act(async () => {
        await render.renderOnce()
        await render.renderOnce()
      })
      const menu = render.captureCharFrame()
      expect(menu).toContain("Assert")
      expect(menu).toContain("Capture")

      act(() => host.press("return"))
      await act(async () => {
        await render.renderOnce()
        await render.renderOnce()
      })
      expect(changes).toEqual(["assertions"])
      expect(
        render.renderer.root.findDescendantById("tab-assertions"),
      ).toBeDefined()

      const activeFrame = render.captureCharFrame().split("\n")
      const remainingAddRow = activeFrame.findIndex((line) =>
        line.includes("+"),
      )
      const remainingAddColumn = activeFrame[remainingAddRow]!.lastIndexOf("+")
      await act(async () => {
        await render.mockMouse.click(
          remainingAddColumn,
          remainingAddRow,
          MouseButtons.LEFT,
        )
      })
      await act(async () => {
        await render.renderOnce()
        await render.renderOnce()
      })
      const remainingMenu = render.captureCharFrame()
      expect(remainingMenu.match(/Assert/g)).toHaveLength(1)
      expect(remainingMenu.match(/Capture/g)).toHaveLength(1)
      act(() => host.press("escape"))
      await act(async () => {
        await render.renderOnce()
        await render.renderOnce()
      })

      const headers = render.renderer.root.findDescendantById(
        "tab-headers",
      ) as BoxRenderable
      await act(async () => {
        await render.mockMouse.click(
          headers.x + 1,
          headers.y,
          MouseButtons.LEFT,
        )
      })
      await act(async () => {
        await render.renderOnce()
      })
      expect(changes).toEqual(["assertions", "headers"])
      expect(
        render.renderer.root.findDescendantById("tab-assertions"),
      ).toBeUndefined()
    } finally {
      cleanup()
    }
  })

  it("keeps optional tabs with disabled declarations visible", async () => {
    const { keymap, cleanup } = setupKeymap()
    try {
      const render = await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <RequestPane
              request={{
                ...request,
                assertions: [
                  {
                    expression: "status",
                    operator: "exists",
                    enabled: false,
                  },
                ],
                captures: {
                  token: { value: "body.token", enabled: false },
                },
              }}
              editState={browsingHeaders}
              editKey=""
              editValue=""
              setEditKey={() => {}}
              setEditValue={() => {}}
              activeTab="headers"
            />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 80, height: 12 },
      )

      await render.renderOnce()
      expect(
        render.renderer.root.findDescendantById("tab-assertions"),
      ).toBeDefined()
      expect(
        render.renderer.root.findDescendantById("tab-captures"),
      ).toBeDefined()
      expect(render.captureCharFrame()).not.toContain("+")
    } finally {
      cleanup()
    }
  })

  it("temporarily exposes optional tabs during jump mode", async () => {
    const { keymap, cleanup } = setupKeymap()
    try {
      const render = await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <RequestPane
              request={request}
              editState={browsingHeaders}
              editKey=""
              editValue=""
              setEditKey={() => {}}
              setEditValue={() => {}}
              activeTab="headers"
              jumpMode
            />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 80, height: 12 },
      )

      await render.renderOnce()
      expect(
        render.renderer.root.findDescendantById("tab-assertions"),
      ).toBeDefined()
      expect(
        render.renderer.root.findDescendantById("tab-captures"),
      ).toBeDefined()
      const frame = render.captureCharFrame()
      expect(frame).toContain(" v ")
      expect(frame).toContain(" c ")
      expect(frame).not.toContain("+")
    } finally {
      cleanup()
    }
  })

  it("does not offer optional tabs in read-only mode", async () => {
    const { keymap, cleanup } = setupKeymap()
    try {
      const render = await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <RequestPane
              request={request}
              editState={browsingHeaders}
              editKey=""
              editValue=""
              setEditKey={() => {}}
              setEditValue={() => {}}
              activeTab="headers"
              interactive={false}
            />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 80, height: 12 },
      )

      await render.renderOnce()
      expect(render.captureCharFrame()).not.toContain("+")
    } finally {
      cleanup()
    }
  })

  it("does not change tabs when a capture commit is rejected", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const changes: FieldKind[] = []
    let interactions = 0
    try {
      const render = await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <RequestPane
              request={request}
              editState={{
                mode: "editing",
                cursor: {
                  field: "captures",
                  row: -1,
                  addingRow: true,
                  subfield: "key",
                },
                editingRow: -1,
              }}
              editKey="bad-name"
              editValue="body.token"
              setEditKey={() => {}}
              setEditValue={() => {}}
              activeTab="captures"
              onInteraction={() => {
                interactions++
                return false
              }}
              onTabChange={(tab) => changes.push(tab)}
            />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 80, height: 16 },
      )

      await render.renderOnce()
      const lines = render.captureCharFrame().split("\n")
      const addRow = lines.findIndex((line) => line.includes("+"))
      const addColumn = lines[addRow]!.lastIndexOf("+")
      await act(async () => {
        await render.mockMouse.click(addColumn, addRow, MouseButtons.LEFT)
      })
      await act(async () => {
        await render.renderOnce()
        await render.renderOnce()
      })
      expect(interactions).toBe(0)
      act(() => host.press("return"))
      await act(async () => {
        await render.renderOnce()
      })

      expect(changes).toEqual([])
      expect(interactions).toBe(1)
      expect(
        render.renderer.root.findDescendantById("tab-captures"),
      ).toBeDefined()
    } finally {
      cleanup()
    }
  })

  it("does not toggle assertion rows when interaction is vetoed", async () => {
    const { keymap, cleanup } = setupKeymap()
    const toggled: Array<[FieldKind, number]> = []
    try {
      const render = await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <RequestPane
              request={automationRequest}
              editState={{
                mode: "browsing",
                cursor: { field: "assertions", row: 0, addingRow: false },
                editingRow: -1,
              }}
              editKey=""
              editValue=""
              setEditKey={() => {}}
              setEditValue={() => {}}
              activeTab="assertions"
              onInteraction={() => false}
              onFieldToggle={(field, row) => toggled.push([field, row])}
            />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 80, height: 10 },
      )
      await render.renderOnce()
      const row = render.renderer.root.findDescendantById(
        "assertions-0",
      ) as BoxRenderable
      const toggle = row.getChildren()[0] as BoxRenderable
      await act(async () => {
        await render.mockMouse.click(toggle.x + 1, toggle.y, MouseButtons.LEFT)
      })

      expect(toggled).toEqual([])
    } finally {
      cleanup()
    }
  })

  it("does not toggle capture rows when interaction is vetoed", async () => {
    const { keymap, cleanup } = setupKeymap()
    const toggled: Array<[FieldKind, number]> = []
    try {
      const render = await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <RequestPane
              request={automationRequest}
              editState={{
                mode: "browsing",
                cursor: { field: "captures", row: 0, addingRow: false },
                editingRow: -1,
              }}
              editKey=""
              editValue=""
              setEditKey={() => {}}
              setEditValue={() => {}}
              activeTab="captures"
              onInteraction={() => false}
              onFieldToggle={(field, row) => toggled.push([field, row])}
            />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 80, height: 10 },
      )
      await render.renderOnce()
      const row = render.renderer.root.findDescendantById(
        "captures-0",
      ) as BoxRenderable
      const toggle = row.getChildren()[0] as BoxRenderable
      await act(async () => {
        await render.mockMouse.click(toggle.x + 1, toggle.y, MouseButtons.LEFT)
      })

      expect(toggled).toEqual([])
    } finally {
      cleanup()
    }
  })

  it("opens the TLS verification select without entering text edit mode", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const activated: Array<[FieldKind, number]> = []
    const toggled: Array<[FieldKind, number]> = []
    const changed: Array<boolean | undefined> = []
    try {
      const { renderOnce, captureCharFrame, mockMouse, renderer } =
        await testRender(
          <KeymapProvider keymap={keymap}>
            <ThemeProvider activeIndex={0} previewIndex={null}>
              <RequestPane
                request={request}
                editState={{
                  mode: "browsing",
                  cursor: {
                    field: "settings",
                    row: 3,
                    addingRow: false,
                  },
                  editingRow: -1,
                }}
                editKey=""
                editValue=""
                setEditKey={() => {}}
                setEditValue={() => {}}
                focused
                activeTab="settings"
                onFieldActivate={(field, row) => activated.push([field, row])}
                onFieldToggle={(field, row) => toggled.push([field, row])}
                onTlsVerifyChange={(verify) => changed.push(verify)}
              />
            </ThemeProvider>
          </KeymapProvider>,
          { width: 80, height: 24 },
        )

      await act(async () => {
        await renderOnce()
      })
      let frame = captureCharFrame()
      const lines = frame.split("\n")
      const labelRow = lines.findIndex((line) =>
        line.includes("TLS Verification"),
      )
      const selectRow = lines.findIndex((line) =>
        line.includes("Inherit (verify)"),
      )
      expect(selectRow).toBe(labelRow)
      expect(lines[labelRow]!.indexOf("TLS Verification")).toBeLessThan(
        lines[labelRow]!.indexOf("Inherit (verify)"),
      )
      expect(lines[labelRow + 1]).toContain(
        "Verify the server certificate, or inherit the collection setting",
      )

      const settingsRow = renderer.root.findDescendantById("settings-3") as
        | BoxRenderable
        | undefined
      const contentRow = settingsRow?.getChildren()[0]
      const select = contentRow?.getChildren()[1]
      expect(settingsRow?.backgroundColor.a).toBeGreaterThan(0)
      expect(settingsRow?.width).toBeGreaterThan(select?.width ?? 0)

      await act(async () => {
        await mockMouse.click(
          lines[selectRow]!.indexOf("Inherit (verify)") + 1,
          selectRow,
          MouseButtons.LEFT,
        )
      })
      await act(async () => {
        await renderOnce()
      })
      frame = captureCharFrame()
      expect(toggled).toEqual([["settings", 3]])
      expect(activated).toEqual([])
      expect(frame).toContain("Do not verify")

      await act(async () => {
        host.press("down")
      })
      await act(async () => {
        await renderOnce()
      })
      await act(async () => {
        host.press("down")
      })
      await act(async () => {
        await renderOnce()
      })
      await act(async () => {
        host.press("return")
      })
      await act(async () => {
        await renderOnce()
      })
      expect(changed).toEqual([false])
    } finally {
      cleanup()
    }
  })

  it("commits a Settings edit when clicking blank tab space", async () => {
    const { keymap, cleanup } = setupKeymap()
    let interactions = 0
    try {
      const { renderOnce, mockMouse } = await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <EditingPane
              activeTab="settings"
              onInteraction={() => interactions++}
            />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 80, height: 16 },
      )

      await renderOnce()
      await act(async () => {
        await mockMouse.click(40, 10, MouseButtons.LEFT)
      })

      expect(interactions).toBe(1)
    } finally {
      cleanup()
    }
  })

  it("commits a Path edit when clicking blank tab space", async () => {
    const { keymap, cleanup } = setupKeymap()
    let interactions = 0
    try {
      const { renderOnce, mockMouse } = await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <EditingPane
              activeTab="pathParams"
              onInteraction={() => interactions++}
            />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 80, height: 16 },
      )

      await renderOnce()
      await act(async () => {
        await mockMouse.click(40, 10, MouseButtons.LEFT)
      })

      expect(interactions).toBe(1)
    } finally {
      cleanup()
    }
  })

  it("commits a Params edit when clicking blank tab space", async () => {
    const { keymap, cleanup } = setupKeymap()
    let interactions = 0
    try {
      const { renderOnce, mockMouse } = await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <EditingPane
              activeTab="params"
              onInteraction={() => interactions++}
            />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 80, height: 16 },
      )

      await renderOnce()
      await act(async () => {
        await mockMouse.click(40, 10, MouseButtons.LEFT)
      })

      expect(interactions).toBe(1)
    } finally {
      cleanup()
    }
  })

  it("does not commit when clicking the active value input", async () => {
    const { keymap, cleanup } = setupKeymap()
    let interactions = 0
    try {
      const { renderOnce, captureCharFrame, mockMouse } = await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <EditingPane
              activeTab="pathParams"
              onInteraction={() => interactions++}
            />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 80, height: 16 },
      )

      await renderOnce()
      const lines = captureCharFrame().split("\n")
      const valueRow = lines.findIndex((line) => line.includes("photoId"))
      if (valueRow < 0) throw new Error("path parameter row was not rendered")
      const valueColumn = lines[valueRow]!.lastIndexOf("42")
      if (valueColumn < 0)
        throw new Error("path parameter value was not rendered")
      await act(async () => {
        await mockMouse.click(valueColumn, valueRow, MouseButtons.LEFT)
      })

      expect(interactions).toBe(0)
    } finally {
      cleanup()
    }
  })
})
