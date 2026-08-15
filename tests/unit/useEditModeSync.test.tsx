import { describe, expect, it } from "bun:test"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestRender } from "../testRender"
import { setupKeymap } from "./_helpers"
import { useEditModeSync } from "../../src/ui/useEditModeSync"
import type { UseEditBrowseResult } from "../../src/hooks/useEditBrowse"
import type { UseFolderEditBrowseResult } from "../../src/hooks/useFolderEditBrowse"
import type { UseEnvironmentEditorResult } from "../../src/hooks/useEnvironmentEditor"

const testRender = createTestRender()

describe("useEditModeSync", () => {
  it("keeps the repair YAML editor in edit mode without entering folder browse", async () => {
    const { keymap, cleanup } = setupKeymap()
    let folderBrowseCalls = 0
    const inactive = {
      editState: { mode: "inactive" },
      cancelEdit: () => {},
      exitBrowse: () => {},
    }

    function Harness() {
      const mode = useEditModeSync({
        focus: "folder",
        view: "main",
        eb: inactive as unknown as UseEditBrowseResult,
        folderEb: {
          ...inactive,
          enterBrowse: () => folderBrowseCalls++,
        } as unknown as UseFolderEditBrowseResult,
        envEditor: {
          ...inactive,
          enterBrowse: () => {},
        } as unknown as UseEnvironmentEditorResult,
        repairEditor: true,
      } as Parameters<typeof useEditModeSync>[0])
      return <text>{mode}</text>
    }

    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <Harness />
      </KeymapProvider>,
      { width: 20, height: 2 },
    )
    await renderOnce()

    expect(captureCharFrame()).toContain("edit")
    expect(keymap.getData("app.mode")).toBe("edit")
    expect(folderBrowseCalls).toBe(0)
    cleanup()
  })
})
