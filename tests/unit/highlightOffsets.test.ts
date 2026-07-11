import { describe, expect, it } from "bun:test"
import {
  buildCharToDisplayOffsets,
  charOffsetToDisplayOffset,
} from "../../src/ui/variable-completion/highlightOffsets"

describe("buildCharToDisplayOffsets", () => {
  it("maps empty string to a single-element array", () => {
    const offsets = buildCharToDisplayOffsets("")
    expect(offsets).toEqual([0])
    expect(offsets[0]).toBe(0)
  })

  it("maps plain ASCII without newlines 1:1", () => {
    const offsets = buildCharToDisplayOffsets("hello")
    expect(offsets[0]).toBe(0)
    expect(offsets[1]).toBe(1)
    expect(offsets[5]).toBe(5)
    expect(offsets[5]).toBe(5)
  })

  it("skips newline in display offset increment", () => {
    const offsets = buildCharToDisplayOffsets("a\nb")
    expect(offsets[0]).toBe(0)
    expect(offsets[1]).toBe(1)
    expect(offsets[2]).toBe(1)
    expect(offsets[3]).toBe(2)
  })

  it("handles multiple newlines correctly", () => {
    const offsets = buildCharToDisplayOffsets('{\n  "x": 1\n}')
    expect(offsets[0]).toBe(0)
    expect(offsets[1]).toBe(1)
    expect(offsets[2]).toBe(1)
    expect(offsets[3]).toBe(2)
    expect(offsets[10]).toBe(9)
    expect(offsets[11]).toBe(9)
  })

  it("handles consecutive newlines", () => {
    const offsets = buildCharToDisplayOffsets("\n\n")
    expect(offsets[0]).toBe(0)
    expect(offsets[1]).toBe(0)
    expect(offsets[2]).toBe(0)
  })

  it("handles newline as first character", () => {
    const offsets = buildCharToDisplayOffsets("\na")
    expect(offsets[0]).toBe(0)
    expect(offsets[1]).toBe(0)
    expect(offsets[2]).toBe(1)
  })

  it("handles newline as last character", () => {
    const offsets = buildCharToDisplayOffsets("a\n")
    expect(offsets[0]).toBe(0)
    expect(offsets[1]).toBe(1)
    expect(offsets[2]).toBe(1)
  })

  it("treats carriage return as zero-width like newline", () => {
    const offsets = buildCharToDisplayOffsets("a\rb")
    expect(offsets[0]).toBe(0)
    expect(offsets[1]).toBe(1)
    expect(offsets[2]).toBe(1)
    expect(offsets[3]).toBe(2)
  })

  it("handles CRLF as two zero-width chars", () => {
    const offsets = buildCharToDisplayOffsets("a\r\nb")
    expect(offsets[0]).toBe(0)
    expect(offsets[1]).toBe(1)
    expect(offsets[2]).toBe(1)
    expect(offsets[3]).toBe(1)
    expect(offsets[4]).toBe(2)
  })

  it("handles surrogate pairs as single display column", () => {
    const offsets = buildCharToDisplayOffsets("a😀b")
    expect(offsets[0]).toBe(0)
    expect(offsets[1]).toBe(1)
    expect(offsets[2]).toBe(1)
    expect(offsets[3]).toBe(2)
  })

  it("handles surrogate pairs with newlines", () => {
    const offsets = buildCharToDisplayOffsets("a\n😀")
    expect(offsets[0]).toBe(0)
    expect(offsets[1]).toBe(1)
    expect(offsets[2]).toBe(1)
    expect(offsets[3]).toBe(1)
    expect(offsets[4]).toBe(2)
  })

  it("last element equals display length excluding newlines", () => {
    const offsets = buildCharToDisplayOffsets('{\n  "x": 1\n}')
    expect(offsets[offsets.length - 1]).toBe(10)
  })
})

describe("charOffsetToDisplayOffset", () => {
  it("returns 0 for offsets of empty string", () => {
    const offsets = buildCharToDisplayOffsets("")
    expect(charOffsetToDisplayOffset(offsets, 0)).toBe(0)
  })

  it("returns correct display offset for plain text", () => {
    const offsets = buildCharToDisplayOffsets("hello")
    expect(charOffsetToDisplayOffset(offsets, 0)).toBe(0)
    expect(charOffsetToDisplayOffset(offsets, 3)).toBe(3)
    expect(charOffsetToDisplayOffset(offsets, 5)).toBe(5)
  })

  it("maps char offset to display offset skipping newlines", () => {
    const offsets = buildCharToDisplayOffsets('{\n  "x": 1\n}')
    expect(charOffsetToDisplayOffset(offsets, 0)).toBe(0)
    expect(charOffsetToDisplayOffset(offsets, 1)).toBe(1)
    expect(charOffsetToDisplayOffset(offsets, 2)).toBe(1)
    expect(charOffsetToDisplayOffset(offsets, 11)).toBe(9)
  })

  it("clamps negative offsets to 0", () => {
    const offsets = buildCharToDisplayOffsets("hello")
    expect(charOffsetToDisplayOffset(offsets, -1)).toBe(0)
    expect(charOffsetToDisplayOffset(offsets, -100)).toBe(0)
  })

  it("clamps offsets beyond length to last element", () => {
    const offsets = buildCharToDisplayOffsets("hello")
    expect(charOffsetToDisplayOffset(offsets, 10)).toBe(5)
    expect(charOffsetToDisplayOffset(offsets, 999)).toBe(5)
  })
})
