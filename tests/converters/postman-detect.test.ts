import { describe, it, expect } from "bun:test"
import { detectPostman } from "../../src/converters/postman/detect"

describe("detectPostman", () => {
  it("detects valid Postman v2.1 JSON by info.schema", () => {
    const spec = JSON.stringify({
      info: {
        name: "Test",
        schema:
          "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      },
      item: [],
    })
    expect(detectPostman(spec)).toBe(true)
  })

  it("detects valid Postman v2.0 JSON by info.schema", () => {
    const spec = JSON.stringify({
      info: {
        name: "Test",
        schema:
          "https://schema.getpostman.com/json/collection/v2.0.0/collection.json",
      },
      item: [],
    })
    expect(detectPostman(spec)).toBe(true)
  })

  it("detects Postman JSON without schema field (heuristic)", () => {
    const spec = JSON.stringify({
      info: { name: "My API" },
      item: [
        {
          name: "Get Users",
          request: {
            method: "GET",
            url: { raw: "http://example.com" },
          },
        },
      ],
    })
    expect(detectPostman(spec)).toBe(true)
  })

  it("rejects invalid JSON", () => {
    expect(detectPostman("not json")).toBe(false)
  })

  it("rejects non-object roots", () => {
    expect(detectPostman('"just a string"')).toBe(false)
    expect(detectPostman("[1,2,3]")).toBe(false)
  })

  it("rejects non-Postman JSON (random object)", () => {
    expect(detectPostman(JSON.stringify({ foo: "bar" }))).toBe(false)
  })

  it("rejects object with info.name but no item array", () => {
    expect(detectPostman(JSON.stringify({ info: { name: "X" } }))).toBe(false)
  })

  it("rejects object with item array but no info.name and no schema", () => {
    expect(detectPostman(JSON.stringify({ item: [] }))).toBe(false)
  })

  it("rejects item that is not an array", () => {
    expect(
      detectPostman(JSON.stringify({ info: { name: "X" }, item: "nope" })),
    ).toBe(false)
  })

  it("rejects object with wrong schema URL", () => {
    const spec = JSON.stringify({
      info: {
        name: "Test",
        schema: "https://some-other-schema.com/v1/",
      },
      item: [],
    })
    expect(detectPostman(spec)).toBe(false)
  })
})
