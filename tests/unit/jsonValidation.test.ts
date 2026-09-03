import { describe, expect, it } from "bun:test"
import type { Environment } from "../../src/schema"
import { validateJsonContent } from "../../src/ui/editor/jsonValidation"

function env(vars: Record<string, string>): Environment {
  return { name: "test", vars }
}

describe("validateJsonContent", () => {
  it("accepts a numeric variable without quotes", () => {
    expect(validateJsonContent('{"id": $ID}', env({ ID: "42" }))).toBeNull()
  })

  it("accepts a boolean variable without quotes", () => {
    expect(
      validateJsonContent('{"enabled": $ENABLED}', env({ ENABLED: "true" })),
    ).toBeNull()
  })

  it("accepts any valid JSON value without quotes", () => {
    expect(
      validateJsonContent('{"data": $DATA}', env({ DATA: "[1,2,3]" })),
    ).toBeNull()
  })

  it("accepts multiple variables without quotes", () => {
    expect(
      validateJsonContent(
        '{"id": $ID, "enabled": $ENABLED}',
        env({ ID: "42", ENABLED: "true" }),
      ),
    ).toBeNull()
  })

  it("rejects a string variable without quotes", () => {
    const error = validateJsonContent('{"user": $USER}', env({ USER: "john" }))
    expect(error).toContain("Invalid JSON:")
  })

  it("accepts a string variable inside quotes", () => {
    expect(
      validateJsonContent('{"user": "$USER"}', env({ USER: "john" })),
    ).toBeNull()
  })

  it("tracks quoted variables across escaped quotes and backslashes", () => {
    const content = String.raw`{"message":"say \"$WORD\"","path":"C:\\$DIR","count":$COUNT "tail":true}`
    expect(
      validateJsonContent(
        content,
        env({ WORD: "hello", DIR: "tmp", COUNT: "2" }),
      ),
    ).toBe("Invalid JSON: Expected ',' at line 1, column 61")
  })

  it("validates many variables without rescanning earlier content", () => {
    const vars: Record<string, string> = {}
    const tokens = Array.from({ length: 20_000 }, (_, index) => {
      vars[`V${index}`] = "0"
      return `$V${index}`
    })
    const content = `[${tokens.join(",")}]`
    const start = performance.now()

    expect(validateJsonContent(content, env(vars))).toBeNull()
    expect(performance.now() - start).toBeLessThan(500)
  })

  it("reports unresolved variables", () => {
    expect(validateJsonContent('{"id": $ID}', env({}))).toBe(
      'Invalid JSON: unresolved variable "ID" at line 1, column 8',
    )
  })

  it("validates escaped dollars without resolving them", () => {
    expect(validateJsonContent('{"value":"$$MISSING"}', env({}))).toBeNull()
    expect(
      validateJsonContent('{"value":"$$$VALUE"}', env({ VALUE: "ok" })),
    ).toBeNull()
    expect(validateJsonContent('{"value": $$MISSING}', env({}))).toBe(
      "Invalid JSON: Invalid symbol at line 1, column 11",
    )
  })

  it("reports a later unresolved variable at its source location", () => {
    const content = '{\n  "id": $ID,\n  "team": $TEAM\n}'
    expect(validateJsonContent(content, env({ ID: "42" }))).toBe(
      'Invalid JSON: unresolved variable "TEAM" at line 3, column 11',
    )
  })

  it("maps errors after substitutions to the original source", () => {
    const content = '{\n  "data": $DATA,\n  "first": 1\n  "second": 2\n}'
    expect(validateJsonContent(content, env({ DATA: "[1, 2, 3, 4, 5]" }))).toBe(
      "Invalid JSON: Expected ',' at line 4, column 3",
    )
  })

  it("identifies errors inside substituted values", () => {
    expect(
      validateJsonContent('{"data": $DATA}', env({ DATA: '"bad\\q"' })),
    ).toBe(
      "Invalid JSON: Invalid escape character in value of $DATA at line 1, column 10",
    )
    expect(
      validateJsonContent('{\n  "data": $DATA\n}', env({ DATA: "[1, 2" })),
    ).toBe("Invalid JSON: Expected ']' in value of $DATA at line 2, column 11")
  })

  it.each([
    [
      "missing comma",
      '{\n  "first": 1\n  "second": 2\n}',
      "Invalid JSON: Expected ',' at line 3, column 3",
    ],
    [
      "missing colon",
      '{"name" "Ada"}',
      "Invalid JSON: Expected ':' at line 1, column 9",
    ],
    [
      "missing value",
      '{"name": }',
      "Invalid JSON: Expected a value at line 1, column 10",
    ],
    [
      "trailing comma",
      '{"name":"Ada",}',
      "Invalid JSON: Expected a property name at line 1, column 15",
    ],
    [
      "unterminated string",
      '{"name":"Ada}',
      "Invalid JSON: Unterminated string at line 1, column 9",
    ],
    [
      "invalid escape",
      '{"name":"bad\\q"}',
      "Invalid JSON: Invalid escape character at line 1, column 9",
    ],
    [
      "trailing content",
      '{"name":"Ada"} true',
      "Invalid JSON: Unexpected content after JSON value at line 1, column 16",
    ],
  ])("reports a precise %s error", (_, content, expected) => {
    expect(validateJsonContent(content, null)).toBe(expected)
  })

  it("rejects JSONC comments and trailing commas", () => {
    expect(validateJsonContent('{"id": 42 // comment\n}', null)).toBe(
      "Invalid JSON: Comments are not allowed at line 1, column 11",
    )
    expect(validateJsonContent('{"id": 42,}', null)).toBe(
      "Invalid JSON: Expected a property name at line 1, column 11",
    )
  })

  it("validates variables against an empty environment when none is active", () => {
    expect(validateJsonContent('{"id": 42}', null)).toBeNull()
    expect(validateJsonContent('{"id": $ID}', null)).toBe(
      'Invalid JSON: unresolved variable "ID" at line 1, column 8',
    )
  })
})
