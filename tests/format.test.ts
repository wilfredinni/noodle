import { describe, it, expect } from "bun:test"
import type { Response } from "../src/schema"
import {
  statusColor,
  formatStatusLine,
  formatHeaders,
  formatBody,
} from "../src/ui/format"
import { opencodeTheme, catppuccinTheme } from "../src/ui/theme"
import type { Theme } from "../src/ui/theme"

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
  const theme: Theme = opencodeTheme

  it("2xx → success", () => {
    expect(statusColor(200, theme)).toBe("#7fd88f")
    expect(statusColor(204, theme)).toBe("#7fd88f")
    expect(statusColor(299, theme)).toBe("#7fd88f")
  })
  it("3xx → info", () => {
    expect(statusColor(300, theme)).toBe("#56b6c2")
    expect(statusColor(304, theme)).toBe("#56b6c2")
    expect(statusColor(399, theme)).toBe("#56b6c2")
  })
  it("4xx → error", () => {
    expect(statusColor(400, theme)).toBe("#e06c75")
    expect(statusColor(404, theme)).toBe("#e06c75")
    expect(statusColor(499, theme)).toBe("#e06c75")
  })
  it("5xx → error", () => {
    expect(statusColor(500, theme)).toBe("#e06c75")
    expect(statusColor(503, theme)).toBe("#e06c75")
    expect(statusColor(599, theme)).toBe("#e06c75")
  })
  it("out of range → textMuted", () => {
    expect(statusColor(100, theme)).toBe("#808080")
    expect(statusColor(199, theme)).toBe("#808080")
    expect(statusColor(600, theme)).toBe("#808080")
    expect(statusColor(0, theme)).toBe("#808080")
  })
})

describe("statusColor with catppuccin", () => {
  it("2xx uses catppuccin success color", () => {
    expect(statusColor(200, catppuccinTheme)).toBe("#a6e3a1")
  })
  it("4xx uses catppuccin error color", () => {
    expect(statusColor(404, catppuccinTheme)).toBe("#f38ba8")
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
  it("renders single header as key-value pair", () => {
    const res = makeRes({ headers: { "content-type": "application/json" } })
    expect(formatHeaders(res)).toEqual([{ key: "content-type", value: "application/json" }])
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
      { key: "content-type", value: "application/json" },
      { key: "x-a", value: "1" },
      { key: "x-b", value: "2" },
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
