import { describe, expect, it } from "bun:test"
import { act } from "react"
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
