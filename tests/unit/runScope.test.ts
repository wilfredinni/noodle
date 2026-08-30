import { describe, expect, it } from "bun:test"
import { createResponseResolver } from "../../src/response"
import { evaluateCaptures, RunScope } from "../../src/runScope"
import { substitute } from "../../src/requests"
import type { Response } from "../../src/schema"

function response(overrides: Partial<Response> = {}): Response {
  return {
    status: 200,
    statusText: "OK",
    headers: { "X-Request-ID": "req-1" },
    body: '{"user":{"id":7},"nothing":null,"roles":["admin"],"meta":{"active":true}}',
    timeMs: 12,
    ...overrides,
  }
}

describe("response captures", () => {
  it("skips disabled captures before resolution", () => {
    expect(
      evaluateCaptures(
        {
          ignored: { value: "body..invalid", enabled: false },
          user_id: { value: "body.user.id", enabled: true },
        },
        createResponseResolver(response()),
      ),
    ).toEqual([
      {
        variable: "user_id",
        expression: "body.user.id",
        success: true,
        type: "number",
        value: 7,
      },
    ])
  })

  it("captures scalar, nested, array, object, and case-insensitive header values", () => {
    const results = evaluateCaptures(
      {
        user_id: { value: "body.user.id", enabled: true },
        request_id: { value: "headers.x-request-id", enabled: true },
        roles: { value: "body.roles", enabled: true },
        meta: { value: "body.meta", enabled: true },
        active: { value: "body.meta.active", enabled: true },
      },
      createResponseResolver(response()),
    )

    expect(results).toEqual([
      {
        variable: "user_id",
        expression: "body.user.id",
        success: true,
        type: "number",
        value: 7,
      },
      {
        variable: "request_id",
        expression: "headers.x-request-id",
        success: true,
        type: "string",
        value: "req-1",
      },
      {
        variable: "roles",
        expression: "body.roles",
        success: true,
        type: "array",
        value: ["admin"],
      },
      {
        variable: "meta",
        expression: "body.meta",
        success: true,
        type: "object",
        value: { active: true },
      },
      {
        variable: "active",
        expression: "body.meta.active",
        success: true,
        type: "boolean",
        value: true,
      },
    ])
  })

  it("keeps explicit null distinct from a missing value", () => {
    expect(
      evaluateCaptures(
        {
          explicit: { value: "body.nothing", enabled: true },
          missing: { value: "body.unknown", enabled: true },
        },
        createResponseResolver(response()),
      ),
    ).toEqual([
      {
        variable: "explicit",
        expression: "body.nothing",
        success: true,
        type: "null",
        value: null,
      },
      {
        variable: "missing",
        expression: "body.unknown",
        success: false,
        failureReason: "missing",
        message: 'Expression "body.unknown" is missing',
      },
    ])
  })

  it("reports invalid JSON, invalid traversal, and invalid expressions", () => {
    expect(
      evaluateCaptures(
        { body: { value: "body.id", enabled: true } },
        createResponseResolver(response({ body: "nope" })),
      )[0],
    ).toMatchObject({ success: false, failureReason: "resolution_error" })
    expect(
      evaluateCaptures(
        { nested: { value: "body.user[0]", enabled: true } },
        createResponseResolver(response()),
      )[0],
    ).toMatchObject({ success: false, failureReason: "resolution_error" })
    expect(
      evaluateCaptures(
        { invalid: { value: "body..id", enabled: true } },
        createResponseResolver(response()),
      )[0],
    ).toMatchObject({ success: false, failureReason: "resolution_error" })
  })
})

describe("RunScope", () => {
  it("overrides environment values and serializes typed JSON values", () => {
    const scope = new RunScope()
    scope.set("same", "run")
    scope.set("count", 7)
    scope.set("enabled", true)
    scope.set("nothing", null)
    scope.set("roles", ["admin"])
    scope.set("meta", { active: true })

    expect(
      scope.environment({ name: "development", vars: { same: "env" } }),
    ).toEqual({
      name: "development",
      vars: {
        same: "run",
        count: "7",
        enabled: "true",
        nothing: "null",
        roles: '["admin"]',
        meta: '{"active":true}',
      },
    })
  })

  it("lets the latest successful capture win and preserves it after failure", () => {
    const scope = new RunScope()
    scope.set("id", 1)
    scope.set("id", 2)
    const [failed] = evaluateCaptures(
      { id: { value: "body.missing", enabled: true } },
      createResponseResolver(response()),
    )
    if (failed?.success) scope.set(failed.variable, failed.value)

    expect(scope.get("id")).toBe(2)
  })

  it("tracks normalized secret values until a non-secret capture replaces them", () => {
    const scope = new RunScope()
    scope.set("token", { value: "secret" }, true)
    expect(scope.secretValues()).toEqual(['{"value":"secret"}'])

    scope.set("token", "public")
    expect(scope.secretValues()).toEqual([])
  })

  it("creates a transient environment without a selected environment", () => {
    expect(new RunScope().environment()).toEqual({ name: "run", vars: {} })
  })

  it("preserves variables that shadow object prototype properties", () => {
    const scope = new RunScope()
    scope.set("__proto__", "captured")

    const environment = scope.environment()
    expect(Object.hasOwn(environment.vars, "__proto__")).toBe(true)
    expect(environment.vars.__proto__).toBe("captured")
    expect(
      substitute(
        {
          id: "prototype",
          name: "Prototype",
          method: "GET",
          url: "https://example.com/$__proto__",
          timeout: 0,
          headers: {},
          params: [],
        },
        environment,
      ).url,
    ).toBe("https://example.com/captured")
  })
})
