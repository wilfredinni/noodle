import { describe, expect, it } from "bun:test"
import {
  formatAssertionValue,
  parseAssertionValue,
} from "../../src/ui/assertionValue"

describe("assertion values", () => {
  it("formats ordinary strings without quotes", () => {
    for (const value of ["hello", "application/json", "01"]) {
      expect(formatAssertionValue(value)).toBe(value)
    }
  })

  it("preserves ambiguous strings through edit round trips", () => {
    expect(formatAssertionValue("")).toBe('""')
    for (const value of ["true", "null", "200", '"hello"', "[1]"]) {
      expect(parseAssertionValue(formatAssertionValue(value))).toBe(value)
    }
  })
})
