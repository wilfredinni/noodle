import { describe, expect, it } from "bun:test"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestKeymap } from "@opentui/keymap/testing"
import { createTestRender } from "../testRender"
import { ThemeProvider } from "../../src/ui/theme"
import { CaptureTab } from "../../src/ui/request-pane/CaptureTab"
import type { Request } from "../../src/schema"

const testRender = createTestRender()
const request: Request = {
  id: "captures",
  name: "Captures",
  method: "GET",
  url: "https://example.com",
  headers: {},
  params: [],
  timeout: 0,
  captures: { token: "body.token" },
}

describe("CaptureTab", () => {
  it("shows request-owned rows and the RunScope lifetime explanation", async () => {
    const { keymap, cleanup } = createTestKeymap()
    const render = await testRender(
      <KeymapProvider
        keymap={
          keymap as unknown as Parameters<typeof KeymapProvider>[0]["keymap"]
        }
      >
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <CaptureTab
            request={request}
            editState={{
              mode: "browsing",
              cursor: { field: "captures", row: 0, addingRow: false },
              editingRow: -1,
            }}
            editKey=""
            editValue=""
            editError={null}
            setEditKey={() => {}}
            setEditValue={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 44, height: 10 },
    )
    await render.renderOnce()
    const frame = render.captureCharFrame()
    expect(frame).toContain("Extract response values for later")
    expect(frame).toContain("requests in a collection run.")
    expect(frame).toContain("token")
    expect(frame).toContain("body.token")
    expect(frame).toContain("+ Add capture")
    cleanup()
  })
})
