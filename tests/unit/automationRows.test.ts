import { describe, expect, it } from "bun:test"
import {
  formatAssertionValue,
  parseAssertionValue,
} from "../../src/ui/automationRows"

describe("automation assertion values", () => {
  it("preserves JSON-looking strings through edit round trips", () => {
    for (const value of ["true", "null", "200"]) {
      expect(parseAssertionValue(formatAssertionValue(value))).toBe(value)
    }
  })
})
