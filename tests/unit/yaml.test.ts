import { describe, expect, it } from "bun:test"
import { load } from "../../src/yaml"

describe("YAML compatibility", () => {
  it("preserves supported js-yaml v4 scalar and merge behavior", () => {
    expect(load("yes")).toBe("yes")
    expect(load("on")).toBe("on")
    expect(load("2026-08-26")).toEqual(new Date("2026-08-26T00:00:00.000Z"))
    expect(load("base: &base\n  enabled: true\ncopy:\n  <<: *base\n")).toEqual({
      base: { enabled: true },
      copy: { enabled: true },
    })
  })
})
