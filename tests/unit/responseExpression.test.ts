import { describe, expect, it } from "bun:test"
import {
  createResponseExpressionCompleter,
  createResponseResolver,
  parseResponseExpression,
} from "../../src/response"
import type { Response } from "../../src/schema"

function response(overrides: Partial<Response> = {}): Response {
  return {
    status: 201,
    statusText: "Created",
    headers: { "Content-Type": "application/json", "X-Trace": "abc" },
    body: JSON.stringify({
      id: null,
      user: { profile: { name: "Noodle" } },
      users: [{ id: 42 }],
    }),
    timeMs: 12.5,
    ...overrides,
  }
}

describe("response expressions", () => {
  it("suggests static roots and one response segment at a time", () => {
    const complete = createResponseExpressionCompleter(response())

    expect(complete("").map(({ value }) => value)).toEqual([
      "status",
      "body",
      "body.",
      "headers.",
      "response.time",
    ])
    expect(complete("headers.")).toEqual([
      { value: "headers.", label: "headers." },
      { value: "headers.Content-Type", label: "Content-Type" },
      { value: "headers.X-Trace", label: "X-Trace" },
    ])
    expect(complete("body.")).toEqual([
      { value: "body.", label: "body." },
      { value: "body.id", label: "id" },
      { value: "body.user", label: "user" },
      { value: "body.users", label: "users" },
    ])
    expect(complete("body.user.")).toEqual([
      { value: "body.user.profile", label: "profile" },
    ])
    expect(complete("body.user.profile.")).toEqual([
      { value: "body.user.profile.name", label: "name" },
    ])
    expect(complete("body.users[")).toEqual([
      { value: "body.users[0]", label: "[0]" },
    ])
    expect(complete("body.users[0].")).toEqual([
      { value: "body.users[0].id", label: "id" },
    ])
    expect(complete("body.us").map(({ value }) => value)).toEqual([
      "body.user",
      "body.users",
    ])
  })

  it("keeps usable suggestions when response fields cannot be completed", () => {
    const complete = createResponseExpressionCompleter(
      response({
        headers: { "X-Trace": "abc", "not valid": "ignored" },
        body: '{"valid":1,"not valid":2}',
      }),
    )

    expect(complete("headers.")).toEqual([
      { value: "headers.", label: "headers." },
      { value: "headers.X-Trace", label: "X-Trace" },
    ])
    expect(complete("body.")).toEqual([
      { value: "body.", label: "body." },
      { value: "body.valid", label: "valid" },
    ])

    const invalidJson = createResponseExpressionCompleter(
      response({ body: "{" }),
    )
    expect(invalidJson("headers.")).toEqual(
      expect.arrayContaining([
        { value: "headers.Content-Type", label: "Content-Type" },
      ]),
    )
    expect(invalidJson("body.")).toEqual([{ value: "body.", label: "body." }])
  })

  it("parses the supported grammar", () => {
    expect(parseResponseExpression("status")).toEqual({ kind: "status" })
    expect(parseResponseExpression("response.time")).toEqual({
      kind: "response-time",
    })
    expect(parseResponseExpression("headers.Content-Type")).toEqual({
      kind: "header",
      name: "Content-Type",
    })
    expect(parseResponseExpression("body")).toEqual({ kind: "body", path: [] })
    expect(parseResponseExpression("body.users[0].id")).toEqual({
      kind: "body",
      path: [
        { kind: "property", name: "users" },
        { kind: "index", index: 0 },
        { kind: "property", name: "id" },
      ],
    })
    expect(parseResponseExpression("body[0].id")).toEqual({
      kind: "body",
      path: [
        { kind: "index", index: 0 },
        { kind: "property", name: "id" },
      ],
    })
  })

  it("resolves status, timing, headers, nested JSON, arrays, and the root body", () => {
    const resolve = createResponseResolver(response())
    expect(resolve("status")).toEqual({ kind: "value", value: 201 })
    expect(resolve("response.time")).toEqual({ kind: "value", value: 12.5 })
    expect(resolve("headers.content-type")).toEqual({
      kind: "value",
      value: "application/json",
    })
    expect(resolve("headers.X-TRACE")).toEqual({
      kind: "value",
      value: "abc",
    })
    expect(resolve("body.user.profile.name")).toEqual({
      kind: "value",
      value: "Noodle",
    })
    expect(resolve("body.users[0].id")).toEqual({
      kind: "value",
      value: 42,
    })
    expect(resolve("body")).toEqual({
      kind: "value",
      value: {
        id: null,
        user: { profile: { name: "Noodle" } },
        users: [{ id: 42 }],
      },
    })
    expect(
      createResponseResolver(response({ body: '[{"id":7}]' }))("body[0].id"),
    ).toEqual({ kind: "value", value: 7 })
  })

  it("distinguishes JSON null, missing values, and traversal errors", () => {
    const resolve = createResponseResolver(response())
    expect(resolve("body.id")).toEqual({ kind: "value", value: null })
    expect(resolve("body.missing")).toEqual({ kind: "missing" })
    expect(resolve("body.users[1]")).toEqual({ kind: "missing" })
    expect(resolve("headers.missing")).toEqual({ kind: "missing" })
    expect(resolve("body.id.value")).toEqual({
      kind: "error",
      message: 'Cannot access property "value" on a non-object value',
    })
    expect(resolve("body.user[0]")).toEqual({
      kind: "error",
      message: "Cannot access index 0 on a non-array value",
    })
  })

  it("reports invalid JSON only for body expressions and parses it once", () => {
    let bodyReads = 0
    const value = response({ body: "{" })
    Object.defineProperty(value, "body", {
      get() {
        bodyReads++
        return "{"
      },
    })
    const resolve = createResponseResolver(value)

    expect(resolve("status")).toEqual({ kind: "value", value: 201 })
    expect(resolve("body.id")).toEqual({
      kind: "error",
      message: "Response body is not valid JSON",
    })
    expect(resolve("body.other")).toEqual({
      kind: "error",
      message: "Response body is not valid JSON",
    })
    expect(bodyReads).toBe(1)
  })

  it("rejects malformed or unsupported expressions", () => {
    for (const expression of [
      "",
      "response",
      "response.status",
      "headers",
      "headers.",
      "headers.Content Type",
      "body.",
      "body..id",
      "body.*",
      "body.$.id",
      "body[-1]",
      "body[01]",
      "body['id']",
      "body[0",
      "body.users[*]",
      "body.users[?(@.id)]",
    ]) {
      expect(() => parseResponseExpression(expression)).toThrow(
        `Invalid response expression "${expression}"`,
      )
    }
  })
})
