import { describe, expect, it } from "bun:test"
import { act } from "react"
import { createTestRender } from "../testRender"
import { KeymapProvider } from "@opentui/keymap/react"
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
