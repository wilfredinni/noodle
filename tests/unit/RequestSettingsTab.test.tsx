import { describe, expect, it } from "bun:test"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestKeymap } from "@opentui/keymap/testing"
import { createTestRender } from "../testRender"
import { SettingsSection } from "../../src/ui/request-pane/RequestSettingsTab"
import { THEMES } from "../../src/ui/theme-data"

const testRender = createTestRender()

describe("RequestSettingsTab tags", () => {
  it("renders tags first, side by side as badges at constrained width", async () => {
    const { keymap, cleanup } = createTestKeymap()
    const render = await testRender(
      <KeymapProvider
        keymap={
          keymap as unknown as Parameters<typeof KeymapProvider>[0]["keymap"]
        }
      >
        <SettingsSection
          request={{
            id: "tagged",
            name: "Tagged",
            method: "GET",
            url: "https://example.com",
            headers: {},
            params: [],
            timeout: 0,
            tags: ["smoke", "users"],
          }}
          editState={{
            mode: "browsing",
            cursor: { field: "settings", row: 5, addingRow: false },
            editingRow: -1,
          }}
          editValue=""
          editError={null}
          setEditValue={() => {}}
          inEdit={false}
          browseActive
          theme={THEMES[0]!}
        />
      </KeymapProvider>,
      { width: 40, height: 32 },
    )
    await render.renderOnce()
    const frame = render.captureCharFrame()
    const lines = frame.split("\n")
    const tagsRow = lines.findIndex((line) => line.includes("Tags"))
    const badgesRow = lines.findIndex((line) => line.includes("smoke"))
    const timeoutRow = lines.findIndex((line) => line.includes("Timeout"))
    expect(tagsRow).toBeGreaterThanOrEqual(0)
    expect(badgesRow).toBeGreaterThan(tagsRow)
    expect(lines[badgesRow]).toContain("smoke")
    expect(lines[badgesRow]).toContain("users")
    expect(lines[badgesRow]).toContain("+ Add tag")
    expect(timeoutRow).toBeGreaterThan(badgesRow)
    cleanup()
  })
})
