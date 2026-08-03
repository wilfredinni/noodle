import { describe, expect, it } from "bun:test"
import { detectSwagger } from "../../src/converters/swagger/detect"

describe("detectSwagger", () => {
  it("detects Swagger 2.0 JSON and YAML", () => {
    expect(detectSwagger('{"swagger":"2.0","paths":{}}')).toBe(true)
    expect(detectSwagger('swagger: "2.0"\npaths: {}\n')).toBe(true)
  })

  it("rejects other versions and invalid paths", () => {
    expect(detectSwagger('{"swagger":"2.1","paths":{}}')).toBe(false)
    expect(detectSwagger('{"swagger":"2.0","paths":[]}')).toBe(false)
    expect(detectSwagger("not: [valid")).toBe(false)
  })
})
