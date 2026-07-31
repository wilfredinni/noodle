import { describe, expect, it } from "bun:test"
import { MouseButtons } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { KeymapProvider } from "@opentui/keymap/react"
import { act } from "react"
import { AuthEditor } from "../../src/ui/AuthEditor"
import { initialEditState } from "../../src/ui/editMode"
import { ThemeProvider, THEMES } from "../../src/ui/theme"
import { setupKeymap } from "./_helpers"

describe("AuthEditor", () => {
  it("activates the API key placement row before opening its select", async () => {
    const { keymap, cleanup } = setupKeymap()
    let focusedRow = -1
    const { renderOnce, mockMouse } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <AuthEditor
            auth={{
              type: "api_key",
              key: "X-API-Key",
              value: "secret",
              placement: "header",
            }}
            editState={initialEditState()}
            inEdit={false}
            browseActive={false}
            setEditValue={() => {}}
            theme={THEMES[0]!}
            onAuthTypeChange={() => {}}
            onApiKeyPlacementChange={() => {}}
            onFocusRow={(row) => {
              focusedRow = row
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 10 },
    )
    await renderOnce()

    await act(async () => {
      await mockMouse.click(10, 6, MouseButtons.LEFT)
    })
    expect(focusedRow).toBe(3)
    cleanup()
  })
})
