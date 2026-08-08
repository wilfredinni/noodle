import { describe, expect, it } from "bun:test"
import { MouseButtons } from "@opentui/core/testing"
import { createTestRender } from "../testRender"
import { KeymapProvider } from "@opentui/keymap/react"
import { act } from "react"
import { AuthEditor } from "../../src/ui/AuthEditor"
import { initialEditState } from "../../src/ui/editMode"
import { ThemeProvider, THEMES } from "../../src/ui/theme"
import { setupKeymap } from "./_helpers"

const testRender = createTestRender()

describe("AuthEditor", () => {
  it("activates the API key placement row before opening its select", async () => {
    const { keymap, cleanup } = setupKeymap()
    let focusedRow = -1
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box width={60} height={10}>
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
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 10 },
    )
    await renderOnce()
    const rows = captureCharFrame().split("\n")
    const y = rows.findIndex((row) => row.includes("Header"))

    await act(async () => {
      await mockMouse.click(50, y, MouseButtons.LEFT)
    })
    expect(focusedRow).toBe(-1)

    await act(async () => {
      await mockMouse.click(rows[y]!.indexOf("Header"), y, MouseButtons.LEFT)
    })
    expect(focusedRow).toBe(3)
    cleanup()
  })
})
