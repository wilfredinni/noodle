import { describe, expect, it } from "bun:test"
import { MouseButtons } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { ThemeProvider, THEMES } from "../../src/ui/theme"
import { initialEditState } from "../../src/ui/editMode"
import { KeyValueSection } from "../../src/ui/KeyValueSection"
import { FormEditor } from "../../src/ui/FormEditor"

describe("request row mouse controls", () => {
  it("activates and toggles key/value rows independently", async () => {
    const activations: Array<[number, boolean]> = []
    const toggles: number[] = []
    const { renderOnce, mockMouse } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <box width={80} height={4}>
          <KeyValueSection
            kind="headers"
            entries={[
              {
                key: "Accept",
                value: { value: "application/json", enabled: true },
              },
            ]}
            editState={initialEditState()}
            editKey=""
            editValue=""
            setEditKey={() => {}}
            setEditValue={() => {}}
            theme={THEMES[0]!}
            onActivateRow={(row, addingRow) =>
              activations.push([row, addingRow])
            }
            onToggleRow={(row) => toggles.push(row)}
          />
        </box>
      </ThemeProvider>,
      { width: 80, height: 4 },
    )
    await renderOnce()

    await mockMouse.click(8, 0, MouseButtons.LEFT)
    await mockMouse.click(1, 0, MouseButtons.LEFT)

    expect(activations).toEqual([[0, false]])
    expect(toggles).toEqual([0])
  })

  it("activates and toggles form rows independently", async () => {
    const activations: Array<[number, boolean]> = []
    const toggles: number[] = []
    const { renderOnce, mockMouse } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <box width={80} height={4}>
          <FormEditor
            request={{
              bodyType: "multipart",
              formData: [
                {
                  name: "avatar",
                  value: "/tmp/avatar.png",
                  enabled: true,
                  type: "file",
                },
              ],
            }}
            editState={initialEditState()}
            editKey=""
            editValue=""
            setEditKey={() => {}}
            setEditValue={() => {}}
            browseActive={false}
            theme={THEMES[0]!}
            onActivateRow={(row, addingRow) =>
              activations.push([row, addingRow])
            }
            onToggleRow={(row) => toggles.push(row)}
          />
        </box>
      </ThemeProvider>,
      { width: 80, height: 4 },
    )
    await renderOnce()

    await mockMouse.click(8, 0, MouseButtons.LEFT)
    await mockMouse.click(1, 0, MouseButtons.LEFT)

    expect(activations).toEqual([[0, false]])
    expect(toggles).toEqual([0])
  })
})
