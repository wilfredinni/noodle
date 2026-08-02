import { describe, expect, it } from "bun:test"
import { act } from "react"
import { testRender } from "@opentui/react/test-utils"
import { KeymapProvider } from "@opentui/keymap/react"
import { MouseButtons } from "@opentui/core/testing"
import { ThemeProvider } from "../../src/ui/theme"
import { THEMES } from "../../src/ui/theme-data"
import { FolderPane } from "../../src/ui/FolderPane"
import { setupKeymap } from "./_helpers"

describe("FolderPane blank click commit", () => {
  it("commits a metadata edit when clicking blank pane space", async () => {
    const { keymap, cleanup } = setupKeymap()
    let interactions = 0
    try {
      const { renderOnce, mockMouse } = await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <FolderPane
              collectionDir="/tmp/collection"
              folder={{
                id: "api",
                path: "api",
                name: "API",
                overrides: {},
                children: [],
              }}
              focused
              editState={{
                mode: "editing",
                cursor: {
                  field: "meta",
                  row: 0,
                  addingRow: false,
                  subfield: undefined,
                },
                editingRow: 0,
              }}
              editKey=""
              editValue="API"
              setEditKey={() => {}}
              setEditValue={() => {}}
              activeTab="meta"
              onAuthTypeChange={() => {}}
              onApiKeyPlacementChange={() => {}}
              activeEnv={null}
              theme={THEMES[0]!}
              onInteraction={() => interactions++}
            />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 80, height: 16 },
      )
      await renderOnce()
      await act(async () => {
        await mockMouse.click(60, 10, MouseButtons.LEFT)
      })
      expect(interactions).toBe(1)
    } finally {
      cleanup()
    }
  })
})
