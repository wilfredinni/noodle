import { describe, it, expect } from "bun:test"
import { methodColor } from "../src/ui/formatRequest"

describe("methodColor", () => {
  it("GET → green", () => {
    expect(methodColor("GET")).toBe("#080")
  })
  it("POST → yellow", () => {
    expect(methodColor("POST")).toBe("#880")
  })
  it("PUT → yellow", () => {
    expect(methodColor("PUT")).toBe("#880")
  })
  it("PATCH → yellow", () => {
    expect(methodColor("PATCH")).toBe("#880")
  })
  it("DELETE → red", () => {
    expect(methodColor("DELETE")).toBe("#c00")
  })
  it("HEAD → dim", () => {
    expect(methodColor("HEAD")).toBe("#888")
  })
  it("OPTIONS → dim", () => {
    expect(methodColor("OPTIONS")).toBe("#888")
  })
})
