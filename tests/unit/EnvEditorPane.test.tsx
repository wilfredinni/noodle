import { describe, expect, it } from "bun:test"
import { MouseButtons } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { ThemeProvider } from "../../src/ui/theme"
import { EnvEditorPane } from "../../src/ui/env-editor/EnvEditorPane"

const inactive = {
  mode: "inactive" as const,
  row: -1,
  addingRow: false,
  editingRow: -1,
}

describe("EnvEditorPane", () => {
  it("activates rows, toggles checkboxes, and activates the add row", async () => {
    const activations: Array<[number, boolean]> = []
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
            onActivateRow={(row, addingRow) =>
              activations.push([row, addingRow])
            }
            onToggleRow={(row) => toggles.push(row)}
          />
        </box>
      </ThemeProvider>,
      { width: 80, height: 8 },
    )
    await renderOnce()

    await mockMouse.click(10, 2, MouseButtons.LEFT)
    await mockMouse.click(2, 2, MouseButtons.LEFT)
    await mockMouse.click(10, 3, MouseButtons.LEFT)

    expect(activations).toEqual([
      [0, false],
      [-1, true],
    ])
    expect(toggles).toEqual([0])
  })
})
