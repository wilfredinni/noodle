import { describe, it, expect } from "bun:test"
import { slugify, METHOD_ITEMS } from "../../src/ui/NewRequestOverlay"

describe("slugify", () => {
  it("converts spaces to hyphens and lowercases", () => {
    expect(slugify("Get Users")).toBe("get-users")
  })

  it("handles single word", () => {
    expect(slugify("Users")).toBe("users")
  })

  it("strips special characters", () => {
    expect(slugify("Get Users!!!")).toBe("get-users")
  })

  it("strips leading and trailing hyphens", () => {
    expect(slugify("-test-")).toBe("test")
  })

  it("handles empty string", () => {
    expect(slugify("")).toBe("")
  })

  it("handles multiple consecutive special chars", () => {
    expect(slugify("foo   bar")).toBe("foo-bar")
  })

  it("truncates at 50 chars", () => {
    const long = "a".repeat(60)
    expect(slugify(long).length).toBeLessThanOrEqual(50)
  })
})

describe("METHOD_ITEMS", () => {
  it("contains all standard methods", () => {
    const ids = METHOD_ITEMS.map((i) => i.id)
    expect(ids).toContain("GET")
    expect(ids).toContain("POST")
    expect(ids).toContain("PUT")
    expect(ids).toContain("PATCH")
    expect(ids).toContain("DELETE")
    expect(ids).toContain("HEAD")
    expect(ids).toContain("OPTIONS")
  })

  it("DELETE label is abbreviated to DEL", () => {
    const del = METHOD_ITEMS.find((i) => i.id === "DELETE")
    expect(del?.label).toBe("DEL")
  })
})
