import { describe, it, expect } from "bun:test"
import type { Response } from "../src/schema"
import {
  statusColor,
  formatStatusLine,
  formatHeaders,
  formatBody,
} from "../src/ui/format"

function makeRes(over: Partial<Response> = {}): Response {
  return {
    status: 200,
    statusText: "OK",
    headers: {},
    body: "",
    timeMs: 5,
    ...over,
  }
}

describe("statusColor", () => {
  it("2xx → green", () => {
    expect(statusColor(200)).toBe("#080")
    expect(statusColor(204)).toBe("#080")
    expect(statusColor(299)).toBe("#080")
  })
  it("3xx → yellow", () => {
    expect(statusColor(300)).toBe("#880")
    expect(statusColor(304)).toBe("#880")
    expect(statusColor(399)).toBe("#880")
  })
  it("4xx → red", () => {
    expect(statusColor(400)).toBe("#c00")
    expect(statusColor(404)).toBe("#c00")
    expect(statusColor(499)).toBe("#c00")
  })
  it("5xx → red", () => {
    expect(statusColor(500)).toBe("#c00")
    expect(statusColor(503)).toBe("#c00")
    expect(statusColor(599)).toBe("#c00")
  })
  it("out of range → muted", () => {
    expect(statusColor(100)).toBe("#888")
    expect(statusColor(199)).toBe("#888")
    expect(statusColor(600)).toBe("#888")
    expect(statusColor(0)).toBe("#888")
  })
})

describe("formatStatusLine", () => {
  it("includes statusText when present", () => {
    const res = makeRes({ status: 200, statusText: "OK", timeMs: 42.7 })
    expect(formatStatusLine(res)).toBe("HTTP 200 OK · 43ms")
  })
  it("omits statusText when empty", () => {
    const res = makeRes({ status: 204, statusText: "", timeMs: 10 })
    expect(formatStatusLine(res)).toBe("HTTP 204 · 10ms")
  })
  it("rounds timeMs to nearest integer", () => {
    expect(
      formatStatusLine(makeRes({ status: 200, statusText: "OK", timeMs: 1.4 })),
    ).toBe("HTTP 200 OK · 1ms")
    expect(
      formatStatusLine(makeRes({ status: 200, statusText: "OK", timeMs: 1.5 })),
    ).toBe("HTTP 200 OK · 2ms")
  })
})

describe("formatHeaders", () => {
  it("returns empty array when no headers", () => {
    expect(formatHeaders(makeRes({ headers: {} }))).toEqual([])
  })
  it("renders single header as 'Key: Value'", () => {
    const res = makeRes({ headers: { "content-type": "application/json" } })
    expect(formatHeaders(res)).toEqual(["content-type: application/json"])
  })
  it("sorts multiple headers alphabetically by key", () => {
    const res = makeRes({
      headers: {
        "x-b": "2",
        "content-type": "application/json",
        "x-a": "1",
      },
    })
    expect(formatHeaders(res)).toEqual([
      "content-type: application/json",
      "x-a: 1",
      "x-b: 2",
    ])
  })
})

describe("formatBody", () => {
  it("pretty-prints valid JSON body (2-space indent)", () => {
    const res = makeRes({ body: '{"b":1,"a":2}' })
    expect(formatBody(res)).toBe('{\n  "b": 1,\n  "a": 2\n}')
  })
  it("returns raw body when JSON.parse fails", () => {
    const res = makeRes({ body: "not json {" })
    expect(formatBody(res)).toBe("not json {")
  })
  it("returns raw body when content-type is not json", () => {
    const res = makeRes({
      headers: { "content-type": "text/plain" },
      body: "hello world",
    })
    expect(formatBody(res)).toBe("hello world")
  })
  it("returns empty string for empty body", () => {
    expect(formatBody(makeRes({ body: "" }))).toBe("")
  })
  it("pretty-prints when content-type is json even if body is already formatted", () => {
    const res = makeRes({
      headers: { "content-type": "application/json; charset=utf-8" },
      body: '{\n  "a": 1\n}',
    })
    expect(formatBody(res)).toBe('{\n  "a": 1\n}')
  })
})
