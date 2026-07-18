import { describe, expect, it } from "bun:test"
import {
  parseResponseBody,
  queryParsedResponseBody,
  queryResponseBody,
} from "../../src/ui/responseQuery"

describe("queryResponseBody", () => {
  const body = JSON.stringify({
    data: {
      items: [
        { id: 1, name: "one" },
        { id: 2, name: "two" },
      ],
    },
  })

  it("formats JSONPath matches as a stable array", () => {
    expect(queryResponseBody(body, "$.data.items[*].id")).toEqual({
      kind: "success",
      body: "[\n  1,\n  2\n]",
      matchCount: 2,
    })
  })

  it("supports nested object matches", () => {
    expect(queryResponseBody(body, "$.data.items[0]")).toEqual({
      kind: "success",
      body: '[\n  {\n    "id": 1,\n    "name": "one"\n  }\n]',
      matchCount: 1,
    })
  })

  it("keeps a primitive match in an array", () => {
    expect(queryResponseBody("[42]", "$[0]")).toEqual({
      kind: "success",
      body: "[\n  42\n]",
      matchCount: 1,
    })
  })

  it("supports deeply nested matches", () => {
    expect(queryResponseBody(body, "$..id")).toEqual({
      kind: "success",
      body: "[\n  1,\n  2\n]",
      matchCount: 2,
    })
  })

  it("returns an empty array when there are no matches", () => {
    expect(queryResponseBody(body, "$.data.items[*].missing")).toEqual({
      kind: "success",
      body: "[]",
      matchCount: 0,
    })
  })

  it("reports malformed response JSON", () => {
    expect(queryResponseBody("{", "$.data")).toEqual({
      kind: "invalid-json",
      message: "Response body is not valid JSON",
    })
  })

  it("reports invalid expressions without throwing", () => {
    const result = queryResponseBody(body, "$.data[?(@.id == )]")
    expect(result.kind).toBe("invalid-expression")
    if (result.kind === "invalid-expression") {
      expect(result.message).toStartWith("Invalid JSONPath:")
    }
  })

  it("queries a previously parsed response body", () => {
    const parsed = parseResponseBody(body)
    expect(parsed.kind).toBe("success")
    if (parsed.kind === "success") {
      expect(
        queryParsedResponseBody(parsed.value, "$.data.items[*].id"),
      ).toEqual({
        kind: "success",
        body: "[\n  1,\n  2\n]",
        matchCount: 2,
      })
    }
  })
})
