import { describe, expect, it } from "bun:test"
import {
  evaluateResponseExecution,
  unevaluatedExecutionResults,
} from "../../src/executionResults"
import { RunScope } from "../../src/runScope"
import type { Request, Response } from "../../src/schema"

const response: Response = {
  status: 200,
  statusText: "OK",
  headers: {},
  body: '{"token":"secret","id":7}',
  timeMs: 10,
}

describe("response execution results", () => {
  it("commits captures before assertions and redacts capture values", () => {
    const scope = new RunScope()
    const results = evaluateResponseExecution(
      {
        captures: {
          id: { value: "body.id", enabled: true },
          token: { value: "body.token", enabled: true },
        },
        assertions: [{ expression: "body.id", operator: "equals", value: 7 }],
      },
      response,
      scope,
      ["secret"],
    )

    expect(scope.get("id")).toBe(7)
    expect(scope.get("token")).toBe("secret")
    expect(results.captures?.results[1]).toMatchObject({
      success: true,
      value: "[REDACTED]",
    })
    expect(results.assertions?.results[0]?.passed).toBe(true)
  })

  it("marks declared results unevaluated before a response exists", () => {
    const request = {
      captures: { id: { value: "body.id", enabled: true } },
      assertions: [{ expression: "status", operator: "exists" }],
    } as Pick<Request, "captures" | "assertions">
    expect(unevaluatedExecutionResults(request)).toEqual({
      captures: { evaluated: false, results: [] },
      assertions: { evaluated: false, results: [] },
    })
  })

  it("omits disabled declarations and leaves prior scope values unchanged", () => {
    const scope = new RunScope()
    scope.set("id", "prior")
    const request: Pick<Request, "captures" | "assertions"> = {
      captures: {
        id: { value: "body.id", enabled: false },
        token: { value: "body.token", enabled: true },
      },
      assertions: [
        {
          expression: "body.missing",
          operator: "exists",
          enabled: false,
        },
        { expression: "status", operator: "equals", value: 200 },
      ],
    }

    const results = evaluateResponseExecution(request, response, scope)
    expect(scope.get("id")).toBe("prior")
    expect(results.captures?.results.map((result) => result.variable)).toEqual([
      "token",
    ])
    expect(
      results.assertions?.results.map((result) => result.expression),
    ).toEqual(["status"])
  })

  it("treats disabled-only declarations as absent", () => {
    const request: Pick<Request, "captures" | "assertions"> = {
      captures: { id: { value: "body.id", enabled: false } },
      assertions: [
        { expression: "body.id", operator: "exists", enabled: false },
      ],
    }

    expect(unevaluatedExecutionResults(request)).toEqual({})
    expect(
      evaluateResponseExecution(request, response, new RunScope()),
    ).toEqual({})
  })
})
