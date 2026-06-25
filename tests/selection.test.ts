import { describe, it, expect } from "bun:test"
import { nextIndex } from "../src/ui/selection"

describe("nextIndex", () => {
  it("moves down by 1", () => {
    expect(nextIndex(0, 5, 1)).toBe(1)
  })
  it("moves up by 1", () => {
    expect(nextIndex(2, 5, -1)).toBe(1)
  })
  it("clamps at the last row when moving down past the end", () => {
    expect(nextIndex(4, 5, 1)).toBe(4)
  })
  it("clamps at the first row when moving up past the start", () => {
    expect(nextIndex(0, 5, -1)).toBe(0)
  })
  it("returns -1 for an empty list", () => {
    expect(nextIndex(0, 0, 1)).toBe(-1)
    expect(nextIndex(0, 0, -1)).toBe(-1)
  })
  it("handles a single-row list (length 1)", () => {
    expect(nextIndex(0, 1, 1)).toBe(0)
    expect(nextIndex(0, 1, -1)).toBe(0)
  })
  it("delta of 0 returns the same index", () => {
    expect(nextIndex(2, 5, 0)).toBe(2)
  })
  it("clamps a delta larger than the list span to the last row", () => {
    expect(nextIndex(0, 5, 10)).toBe(4)
  })
  it("clamps a negative delta larger than the list span to the first row", () => {
    expect(nextIndex(4, 5, -10)).toBe(0)
  })
})
