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

  it("fully redacts declared secret captures while retaining raw scope values", () => {
    const scope = new RunScope()
    const results = evaluateResponseExecution(
      {
        captures: {
          token: {
            value: "body.token",
            enabled: true,
            persist: "secret",
          },
        },
        assertions: [
          { expression: "body.token", operator: "equals", value: "secret" },
        ],
      },
      response,
      scope,
    )

    expect(scope.get("token")).toBe("secret")
    expect(scope.secretValues()).toEqual(["secret"])
    expect(results.captures?.results[0]).toMatchObject({
      success: true,
      value: "[REDACTED]",
    })
    expect(results.assertions?.results[0]).toMatchObject({
      expected: "[REDACTED]",
      actual: "[REDACTED]",
      passed: true,
    })
  })

  it("redacts structured secret paths without masking public primitives", () => {
    const scope = new RunScope()
    const results = evaluateResponseExecution(
      {
        captures: {
          credentials: {
            value: "body.credentials",
            enabled: true,
            persist: "secret",
          },
        },
        assertions: [
          { expression: "body.credentials.attempts", operator: "isNumber" },
          { expression: "body.credentials.enabled", operator: "isBoolean" },
          { expression: "body.credentials.empty", operator: "isNull" },
          { expression: "body.requestId", operator: "isString" },
          { expression: "body.attempts", operator: "isNumber" },
          { expression: "body.enabled", operator: "isBoolean" },
          { expression: "body.empty", operator: "isNull" },
          { expression: "body.version", operator: "isString" },
          { expression: "body.active", operator: "isString" },
          { expression: "body.nothing", operator: "isString" },
        ],
      },
      {
        ...response,
        body: JSON.stringify({
          credentials: { attempts: 1, enabled: true, empty: null },
          requestId: "request-1",
          attempts: 1,
          enabled: true,
          empty: null,
          version: "1",
          active: "true",
          nothing: "null",
        }),
      },
      scope,
    )

    expect(scope.get("credentials")).toEqual({
      attempts: 1,
      enabled: true,
      empty: null,
    })
    expect(results.assertions?.results.map((result) => result.actual)).toEqual([
      "[REDACTED]",
      "[REDACTED]",
      "[REDACTED]",
      "request-1",
      1,
      true,
      null,
      "1",
      "true",
      "null",
    ])
  })

  it("redacts distinctive primitive secrets across responses", () => {
    const scope = new RunScope()
    evaluateResponseExecution(
      {
        captures: {
          otp: { value: "body.otp", persist: "secret", enabled: true },
        },
      },
      { ...response, body: '{"otp":123456}' },
      scope,
    )

    const results = evaluateResponseExecution(
      {
        assertions: [
          { expression: "body.otp", operator: "isNumber" },
          { expression: "body.requestId", operator: "isString" },
        ],
      },
      {
        ...response,
        body: '{"otp":123456,"requestId":"request-123456"}',
      },
      scope,
    )

    expect(results.assertions?.results.map((result) => result.actual)).toEqual([
      "[REDACTED]",
      "request-123456",
    ])
  })

  it("treats captures from sensitive response headers as secret", () => {
    const scope = new RunScope()
    const results = evaluateResponseExecution(
      {
        captures: {
          session: { value: "headers.Set-Cookie", enabled: true },
        },
      },
      { ...response, headers: { "Set-Cookie": "sid=cookie-secret" } },
      scope,
    )

    expect(scope.get("session")).toBe("sid=cookie-secret")
    expect(scope.secretValues()).toEqual(["sid=cookie-secret"])
    expect(results.captures?.results[0]).toMatchObject({
      success: true,
      value: "[REDACTED]",
    })
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
