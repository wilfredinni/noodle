import { describe, expect, it } from "bun:test"
import { formatCollectionFormat } from "../../src/app/humanOutput"

function plain(text: string): string {
  return text.replace(
    new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"),
    "",
  )
}

describe("formatCollectionFormat", () => {
  it("reports collection formatting work", () => {
    expect(
      plain(
        formatCollectionFormat({
          path: "/tmp/demo",
          requestCount: 2,
          formattedJsonBodies: 1,
        }),
      ),
    ).toBe("✓ Formatted 2 requests\n  /tmp/demo\n  Pretty-printed 1 JSON body")
  })
})
