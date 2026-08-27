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
        captures: { id: "body.id", token: "body.token" },
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
      captures: { id: "body.id" },
      assertions: [{ expression: "status", operator: "exists" }],
    } as Pick<Request, "captures" | "assertions">
    expect(unevaluatedExecutionResults(request)).toEqual({
      captures: { evaluated: false, results: [] },
      assertions: { evaluated: false, results: [] },
    })
  })
})
