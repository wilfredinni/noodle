import { describe, expect, it } from "bun:test"
import type { Environment } from "../../src/schema"
import { validateJsonContent } from "../../src/ui/jsonValidation"

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

  it("rejects a string variable without quotes", () => {
    const error = validateJsonContent('{"user": $USER}', env({ USER: "john" }))
    expect(error).toContain("Invalid JSON:")
  })

  it("accepts a string variable inside quotes", () => {
    expect(
      validateJsonContent('{"user": "$USER"}', env({ USER: "john" })),
    ).toBeNull()
  })

  it("reports unresolved variables", () => {
    expect(validateJsonContent('{"id": $ID}', env({}))).toBe(
      'Invalid JSON: unresolved variable "ID"',
    )
  })

  it("falls back to normal JSON validation without an environment", () => {
    expect(validateJsonContent('{"id": 42}', null)).toBeNull()
    expect(validateJsonContent('{"id": $ID}', null)).toContain("Invalid JSON:")
  })
})
