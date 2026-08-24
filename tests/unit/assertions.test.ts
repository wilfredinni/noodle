import { describe, expect, it } from "bun:test"
import { compileAssertionRegex, evaluateAssertions } from "../../src/assertions"
import type { Response, ResponseAssertion } from "../../src/schema"

function response(body: unknown): Response {
  return {
    status: 200,
    statusText: "OK",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    timeMs: 25,
  }
}

const body = {
  string: "hello noodle",
  number: 5,
  boolean: true,
  array: [1, { id: 2 }],
  object: { id: 2 },
  null: null,
}

describe("response assertions", () => {
  const cases: Array<{
    operator: ResponseAssertion["operator"]
    passing: ResponseAssertion
    failing: ResponseAssertion
  }> = [
    {
      operator: "equals",
      passing: {
        expression: "body.object",
        operator: "equals",
        value: { id: 2 },
      },
      failing: {
        expression: "body.object",
        operator: "equals",
        value: { id: 3 },
      },
    },
    {
      operator: "notEquals",
      passing: { expression: "body.number", operator: "notEquals", value: 4 },
      failing: { expression: "body.number", operator: "notEquals", value: 5 },
    },
    {
      operator: "exists",
      passing: { expression: "body.string", operator: "exists" },
      failing: { expression: "body.missing", operator: "exists" },
    },
    {
      operator: "notExists",
      passing: { expression: "body.missing", operator: "notExists" },
      failing: { expression: "body.string", operator: "notExists" },
    },
    {
      operator: "isString",
      passing: { expression: "body.string", operator: "isString" },
      failing: { expression: "body.number", operator: "isString" },
    },
    {
      operator: "isNumber",
      passing: { expression: "body.number", operator: "isNumber" },
      failing: { expression: "body.string", operator: "isNumber" },
    },
    {
      operator: "isBoolean",
      passing: { expression: "body.boolean", operator: "isBoolean" },
      failing: { expression: "body.number", operator: "isBoolean" },
    },
    {
      operator: "isArray",
      passing: { expression: "body.array", operator: "isArray" },
      failing: { expression: "body.object", operator: "isArray" },
    },
    {
      operator: "isObject",
      passing: { expression: "body.object", operator: "isObject" },
      failing: { expression: "body.array", operator: "isObject" },
    },
    {
      operator: "isNull",
      passing: { expression: "body.null", operator: "isNull" },
      failing: { expression: "body.missing", operator: "isNull" },
    },
    {
      operator: "notNull",
      passing: { expression: "body.number", operator: "notNull" },
      failing: { expression: "body.null", operator: "notNull" },
    },
    {
      operator: "gt",
      passing: { expression: "body.number", operator: "gt", value: 4 },
      failing: { expression: "body.number", operator: "gt", value: 5 },
    },
    {
      operator: "gte",
      passing: { expression: "body.number", operator: "gte", value: 5 },
      failing: { expression: "body.number", operator: "gte", value: 6 },
    },
    {
      operator: "lt",
      passing: { expression: "body.number", operator: "lt", value: 6 },
      failing: { expression: "body.number", operator: "lt", value: 5 },
    },
    {
      operator: "lte",
      passing: { expression: "body.number", operator: "lte", value: 5 },
      failing: { expression: "body.number", operator: "lte", value: 4 },
    },
    {
      operator: "contains",
      passing: {
        expression: "body.string",
        operator: "contains",
        value: "noodle",
      },
      failing: {
        expression: "body.string",
        operator: "contains",
        value: "pasta",
      },
    },
    {
      operator: "notContains",
      passing: {
        expression: "body.string",
        operator: "notContains",
        value: "pasta",
      },
      failing: {
        expression: "body.string",
        operator: "notContains",
        value: "noodle",
      },
    },
    {
      operator: "matches",
      passing: {
        expression: "body.string",
        operator: "matches",
        value: "^hello",
      },
      failing: {
        expression: "body.string",
        operator: "matches",
        value: "world$",
      },
    },
  ]

  for (const testCase of cases) {
    it(`evaluates passing and failing ${testCase.operator} assertions`, () => {
      const [passing, failing] = evaluateAssertions(
        [testCase.passing, testCase.failing],
        response(body),
      )
      expect(passing!.passed).toBe(true)
      expect(failing!.passed).toBe(false)
      expect(failing!.message.length).toBeGreaterThan(0)
    })
  }

  it("uses deep element equality for array containment", () => {
    expect(
      evaluateAssertions(
        [{ expression: "body.array", operator: "contains", value: { id: 2 } }],
        response(body),
      )[0],
    ).toMatchObject({ passed: true, actual: [1, { id: 2 }] })
  })

  it("preserves an actual null and omits actual for missing or errors", () => {
    const results = evaluateAssertions(
      [
        { expression: "body.null", operator: "isNull" },
        { expression: "body.missing", operator: "exists" },
        { expression: "body.null.value", operator: "exists" },
      ],
      response(body),
    )
    expect(results[0]).toMatchObject({ actual: null, passed: true })
    expect(results[1]).not.toHaveProperty("actual")
    expect(results[2]).not.toHaveProperty("actual")
    expect(results[2]!.message).toContain("Cannot access property")
  })

  it("fails type mismatches without coercion", () => {
    const results = evaluateAssertions(
      [
        { expression: "body.string", operator: "gt", value: 1 },
        { expression: "body.number", operator: "contains", value: 5 },
        { expression: "body.string", operator: "contains", value: 5 },
        { expression: "body.number", operator: "matches", value: "5" },
      ],
      response(body),
    )
    expect(results.every((result) => !result.passed)).toBe(true)
    expect(results.map((result) => result.message)).toEqual([
      'Operator "gt" requires numbers',
      'Operator "contains" requires a string or array',
      'Operator "contains" requires a string or array',
      'Operator "matches" requires strings',
    ])
  })

  it("turns an invalid substituted regex into a failed result", () => {
    expect(
      evaluateAssertions(
        [{ expression: "body.string", operator: "matches", value: "[" }],
        response(body),
      )[0],
    ).toMatchObject({ passed: false, message: "Invalid regular expression" })
  })

  it("supports one safe repetition and rejects backtracking regexes", () => {
    expect(compileAssertionRegex("^user-\\d+$").kind).toBe("success")
    expect(compileAssertionRegex("^(a+)+$")).toEqual({
      kind: "error",
      message: "Regular expression uses unsupported syntax",
    })
    expect(compileAssertionRegex(".*a")).toEqual({
      kind: "error",
      message: "Regular expression uses unsupported syntax",
    })
    expect(compileAssertionRegex("[ab]+c")).toEqual({
      kind: "error",
      message: "Regular expression uses unsupported syntax",
    })
    expect(compileAssertionRegex("^.*a").kind).toBe("success")
    expect(
      evaluateAssertions(
        [
          {
            expression: "body.string",
            operator: "matches",
            value: "^(a+)+$",
          },
        ],
        response(body),
      )[0],
    ).toMatchObject({
      passed: false,
      message: "Regular expression uses unsupported syntax",
    })
    expect(
      evaluateAssertions(
        [
          {
            expression: "body.string",
            operator: "matches",
            value: ".*a",
          },
        ],
        response(body),
      )[0],
    ).toMatchObject({
      passed: false,
      message: "Regular expression uses unsupported syntax",
    })
  })

  it("does not treat expression errors as notExists", () => {
    expect(
      evaluateAssertions(
        [{ expression: "body.null.value", operator: "notExists" }],
        response(body),
      )[0],
    ).toMatchObject({ passed: false })
  })
})
