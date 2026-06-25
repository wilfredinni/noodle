import { describe, it, expect } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { Sidebar } from "../src/ui/Sidebar"
import type { Request, Collection } from "../src/schema"

function makeRequest(i: number): Request {
  return {
    id: `req-${i}`,
    name: `Request number ${i}`,
    method: i % 2 === 0 ? "GET" : "POST",
    url: `http://example.com/${i}`,
    headers: {},
    params: {},
  }
}

describe("Sidebar scrollbox", () => {
  it("renders without crashing with many requests", async () => {
    const requests = Array.from({ length: 50 }, (_, i) => makeRequest(i))
    const collection: Collection = { id: "test", name: "Test", requests }

    const { renderOnce, captureCharFrame } = await testRender(
      <Sidebar
        collection={collection}
        loading={false}
        error={null}
        selectedIndex={5}
        focused={true}
      />,
      { width: 80, height: 24 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).not.toBe("")

    const lines = frame.split("\n").filter(l => l.trim() !== "")
    expect(lines.length).toBeLessThan(50)

    expect(frame).toContain("Request number 5")
  })
})
