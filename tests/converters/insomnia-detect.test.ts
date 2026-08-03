import { describe, expect, it } from "bun:test"
import { detectInsomnia } from "../../src/converters/insomnia/detect"

describe("detectInsomnia", () => {
  it("detects Insomnia v4 and v5 exports", () => {
    for (const format of [4, 5]) {
      expect(
        detectInsomnia(
          JSON.stringify({
            _type: "export",
            __export_format: format,
            resources: [],
          }),
        ),
      ).toBe(true)
    }
  })

  it("rejects malformed and non-Insomnia JSON", () => {
    expect(detectInsomnia("not json")).toBe(false)
    expect(
      detectInsomnia(
        JSON.stringify({ _type: "export", __export_format: 3, resources: [] }),
      ),
    ).toBe(false)
    expect(
      detectInsomnia(JSON.stringify({ _type: "export", __export_format: 4 })),
    ).toBe(false)
    expect(detectInsomnia(JSON.stringify([]))).toBe(false)
  })
})
