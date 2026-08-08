import { describe, expect, it } from "bun:test"
import { MouseButtons } from "@opentui/core/testing"
import { createTestRender } from "../testRender"
import { act } from "react"
import { ThemeProvider } from "../../src/ui/theme"
import { EnvEditorPane } from "../../src/ui/env-editor/EnvEditorPane"

const testRender = createTestRender()

const inactive = {
  mode: "inactive" as const,
  row: -1,
  addingRow: false,
  editingRow: -1,
}

describe("EnvEditorPane", () => {
  it("commits when clicking pane background but not the active input", async () => {
    let interactions = 0
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <box width={80} height={8}>
          <EnvEditorPane
            draft={{
              name: "development",
              color: undefined,
              varRows: [
                {
                  id: 1,
                  key: "BASE_URL",
                  value: "https://api.test",
                  enabled: true,
                },
              ],
            }}
            editState={{
              mode: "editing",
              row: 0,
              addingRow: false,
              subfield: "value",
              editingRow: 0,
            }}
            editKey="BASE_URL"
            editValue="https://api.test"
            setEditKey={() => {}}
            setEditValue={() => {}}
            saving={false}
            error={null}
            focused
            onInteraction={() => interactions++}
          />
        </box>
      </ThemeProvider>,
      { width: 80, height: 8 },
    )
    await renderOnce()

    const lines = captureCharFrame().split("\n")
    const valueRow = lines.findIndex((line) =>
      line.includes("https://api.test"),
    )
    if (valueRow < 0) throw new Error("environment value row was not rendered")
    const valueColumn = lines[valueRow]!.indexOf("https://api.test")
    await mockMouse.click(valueColumn, valueRow, MouseButtons.LEFT)
    expect(interactions).toBe(0)

    await mockMouse.click(70, 6, MouseButtons.LEFT)
    expect(interactions).toBe(1)
  })

  it("shows a variables jump badge in jump mode", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <box width={80} height={8}>
          <EnvEditorPane
            draft={null}
            editState={inactive}
            editKey=""
            editValue=""
            setEditKey={() => {}}
            setEditValue={() => {}}
            saving={false}
            error={null}
            focused={false}
            jumpMode
          />
        </box>
      </ThemeProvider>,
      { width: 80, height: 8 },
    )
    await renderOnce()
    const spans = captureSpans().lines.flatMap((line) => line.spans)
    expect(spans.map((span) => span.text)).toContain("v")
    expect(spans.map((span) => span.text).join("")).not.toContain("Variables")
  })

  it("activates rows, toggles checkboxes, and activates the add row", async () => {
    const activations: Array<[number, boolean, "key" | "value" | undefined]> =
      []
    const toggles: number[] = []
    const { renderOnce, mockMouse } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <box width={80} height={8}>
          <EnvEditorPane
            draft={{
              name: "development",
              color: undefined,
              varRows: [
                {
                  id: 1,
                  key: "BASE_URL",
                  value: "https://api.test",
                  enabled: true,
                },
              ],
            }}
            editState={inactive}
            editKey=""
            editValue=""
            setEditKey={() => {}}
            setEditValue={() => {}}
            saving={false}
            error={null}
            focused
            onActivateRow={(row, addingRow, subfield) =>
              activations.push([row, addingRow, subfield])
            }
            onToggleRow={(row) => toggles.push(row)}
          />
        </box>
      </ThemeProvider>,
      { width: 80, height: 8 },
    )
    await renderOnce()

    await act(async () => {
      await mockMouse.click(10, 2, MouseButtons.LEFT)
      await mockMouse.click(60, 2, MouseButtons.LEFT)
      await mockMouse.click(2, 2, MouseButtons.LEFT)
      await mockMouse.click(10, 3, MouseButtons.LEFT)
    })

    expect(activations).toEqual([
      [0, false, "key"],
      [0, false, "value"],
      [-1, true, "key"],
    ])
    expect(toggles).toEqual([0])
  })
})
