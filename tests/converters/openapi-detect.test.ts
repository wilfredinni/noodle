import { describe, it, expect } from "bun:test"
import { detectOpenApi } from "../../src/converters/openapi/detect"

describe("detectOpenApi", () => {
  it("detects valid OpenAPI 3.0 JSON", () => {
    const spec = JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Test" },
      paths: { "/x": { get: { operationId: "getX" } } },
    })
    expect(detectOpenApi(spec)).toBe(true)
  })

  it("detects valid OpenAPI 3.0 YAML", () => {
    const spec = `openapi: "3.0.0"\ninfo:\n  title: Test\npaths:\n  /x:\n    get:\n      operationId: getX\n`
    expect(detectOpenApi(spec)).toBe(true)
  })

  it("rejects Swagger 2.0", () => {
    const spec = JSON.stringify({
      swagger: "2.0",
      info: { title: "Test" },
      paths: { "/x": { get: {} } },
    })
    expect(detectOpenApi(spec)).toBe(false)
  })

  it("rejects non-object roots", () => {
    expect(detectOpenApi('"just a string"')).toBe(false)
    expect(detectOpenApi("[1,2,3]")).toBe(false)
  })

  it("rejects missing openapi field", () => {
    expect(detectOpenApi(JSON.stringify({ info: {}, paths: {} }))).toBe(false)
  })

  it("rejects non-string version", () => {
    expect(detectOpenApi(JSON.stringify({ openapi: 3, paths: {} }))).toBe(false)
  })

  it("rejects missing paths", () => {
    expect(detectOpenApi(JSON.stringify({ openapi: "3.0.0" }))).toBe(false)
  })

  it("rejects paths as array", () => {
    expect(detectOpenApi(JSON.stringify({ openapi: "3.0.0", paths: [] }))).toBe(
      false,
    )
  })

  it("rejects completely invalid YAML", () => {
    expect(detectOpenApi(": : : :")).toBe(false)
  })

  it("rejects random JSON", () => {
    expect(detectOpenApi(JSON.stringify({ foo: "bar" }))).toBe(false)
  })
})
