import { describe, expect, it } from "bun:test"
import { createTestRender } from "../testRender"
import { ThemeProvider } from "../../src/ui/theme"
import { ValidationNotice } from "../../src/ui/editor/ValidationNotice"

const testRender = createTestRender()

describe("ValidationNotice", () => {
  it("keeps the title and detail on single truncated lines", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <box style={{ width: 48, height: 4 }}>
          <ValidationNotice
            notice={{
              title:
                "Invalid request YAML for a-very-long-request-filename-that-does-not-fit.yml",
              detail:
                'Line 42, Col 18: "timeout" must be a finite number and this detail is intentionally longer than the available editor width',
            }}
          />
        </box>
      </ThemeProvider>,
      { width: 48, height: 6 },
    )
    await renderOnce()

    const lines = captureCharFrame().split("\n")
    const titleLine = lines.find((line) => line.includes("Invalid request"))
    const detailLine = lines.find((line) => line.includes("Line 42"))
    expect(titleLine).toBeDefined()
    expect(detailLine).toBeDefined()
    expect(titleLine!).toContain("! Invalid request")
    expect(titleLine!).toContain("...")
    expect(detailLine!).toContain("Line 42")
    expect(detailLine!).toContain("...")
    expect(
      lines.filter((line) => line.includes("Invalid request")),
    ).toHaveLength(1)
    expect(
      lines.filter((line) => line.includes("detail is intentionally")),
    ).toHaveLength(0)
  })
})
