import { describe, it, expect } from "bun:test"
import {
  parseRow,
  requestEquals,
  applyDraft,
  removeRequestDraftEntry,
} from "../src/hooks/useRequestDraft"
import type { Request } from "../src/schema"

function makeReq(over: Partial<Request> = {}): Request {
  return {
    id: "r1",
    name: "Test",
    method: "GET",
    url: "https://example.com",
    headers: {},
    params: [],
    timeout: 0,
    followRedirects: true,
    maxRedirects: 5,
    auth: { type: "none" },
    ...over,
  }
}

describe("parseRow", () => {
  it("splits on first colon", () => {
    expect(parseRow("Content-Type: application/json")).toEqual({
      key: "Content-Type",
      value: "application/json",
    })
  })
  it("trims key and value", () => {
    expect(parseRow("  Content-Type :   application/json  ")).toEqual({
      key: "Content-Type",
      value: "application/json",
    })
  })
  it("no colon → key only, empty value", () => {
    expect(parseRow("X-Custom-Header")).toEqual({
      key: "X-Custom-Header",
      value: "",
    })
  })
  it("value contains colons (split on first only)", () => {
    expect(parseRow("X-Time: 12:30:00")).toEqual({
      key: "X-Time",
      value: "12:30:00",
    })
  })
  it("empty input → empty key, empty value (caller treats as delete)", () => {
    expect(parseRow("")).toEqual({ key: "", value: "" })
    expect(parseRow("   ")).toEqual({ key: "", value: "" })
  })
})

describe("path parameter drafts", () => {
  it("creates an entry when a virtual URL token receives a value", () => {
    const original = makeReq({ url: "https://example.com/posts/:post_id" })
    const next = applyDraft(new Map(), "r1", original, {
      kind: "setPathParamRow",
      index: 0,
      key: "post_id",
      value: "42",
    })

    expect(next.get("r1")!.pathParams).toEqual([
      { name: "post_id", value: "42", enabled: true },
    ])
  })

  it("does not persist an empty virtual URL token", () => {
    const original = makeReq({ url: "https://example.com/posts/:post_id" })
    const next = applyDraft(new Map(), "r1", original, {
      kind: "setPathParamRow",
      index: 0,
      key: "post_id",
      value: "",
    })

    expect(next.get("r1")!.pathParams).toEqual([])
  })
})

describe("requestEquals", () => {
  it("equal requests → true", () => {
    const a = makeReq()
    expect(requestEquals(a, a)).toBe(true)
  })
  it("differing url → false", () => {
    expect(
      requestEquals(
        makeReq({ url: "https://a.com" }),
        makeReq({ url: "https://b.com" }),
      ),
    ).toBe(false)
  })
  it("differing body → false", () => {
    expect(requestEquals(makeReq({ body: "x" }), makeReq({ body: "y" }))).toBe(
      false,
    )
  })
  it("body undefined vs empty string → not equal (semantically distinct)", () => {
    expect(
      requestEquals(makeReq({ body: undefined }), makeReq({ body: "" })),
    ).toBe(false)
  })
  it("differing method → false", () => {
    expect(
      requestEquals(makeReq({ method: "GET" }), makeReq({ method: "POST" })),
    ).toBe(false)
  })
  it("differing headers → false", () => {
    const a = makeReq({ headers: { A: { value: "1", enabled: true } } })
    const b = makeReq({ headers: { A: { value: "2", enabled: true } } })
    expect(requestEquals(a, b)).toBe(false)
  })
  it("same headers different insertion order → true (deep record compare)", () => {
    const a = makeReq({
      headers: {
        A: { value: "1", enabled: true },
        B: { value: "2", enabled: true },
      },
    })
    const b = makeReq({
      headers: {
        B: { value: "2", enabled: true },
        A: { value: "1", enabled: true },
      },
    })
    expect(requestEquals(a, b)).toBe(true)
  })
  it("differing params → false", () => {
    expect(
      requestEquals(
        makeReq({ params: [{ name: "q", value: "1", enabled: true }] }),
        makeReq({ params: [{ name: "q", value: "2", enabled: true }] }),
      ),
    ).toBe(false)
  })
  it("differing auth → false", () => {
    const a = makeReq({ auth: { type: "none" } })
    const b = makeReq({ auth: { type: "bearer", token: "t" } })
    expect(requestEquals(a, b)).toBe(false)
  })
  it("both auth undefined → true", () => {
    expect(requestEquals(makeReq(), makeReq())).toBe(true)
  })
  it("same timeout → true", () => {
    expect(
      requestEquals(makeReq({ timeout: 5000 }), makeReq({ timeout: 5000 })),
    ).toBe(true)
  })
  it("differing timeout → false", () => {
    expect(
      requestEquals(makeReq({ timeout: 0 }), makeReq({ timeout: 10000 })),
    ).toBe(false)
  })
  it("same followRedirects → true", () => {
    expect(
      requestEquals(
        makeReq({ followRedirects: false }),
        makeReq({ followRedirects: false }),
      ),
    ).toBe(true)
  })
  it("differing followRedirects → false", () => {
    expect(
      requestEquals(
        makeReq({ followRedirects: true }),
        makeReq({ followRedirects: false }),
      ),
    ).toBe(false)
  })
  it("same maxRedirects → true", () => {
    expect(
      requestEquals(
        makeReq({ maxRedirects: 10 }),
        makeReq({ maxRedirects: 10 }),
      ),
    ).toBe(true)
  })
  it("differing maxRedirects → false", () => {
    expect(
      requestEquals(makeReq({ maxRedirects: 5 }), makeReq({ maxRedirects: 0 })),
    ).toBe(false)
  })
  it("name/id differences → still equal (only url/method/headers/params/body/auth compared)", () => {
    const a = makeReq({ id: "r1", name: "A" })
    const b = makeReq({ id: "r2", name: "B" })
    expect(requestEquals(a, b)).toBe(true)
  })
})

describe("applyDraft", () => {
  it("setMethod updates method and preserves the request", () => {
    const original = makeReq({ method: "GET" })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "setMethod",
      method: "POST",
    })
    expect(next.get("r1")!.method).toBe("POST")
    expect(next.get("r1")!.url).toBe(original.url)
    expect(requestEquals(next.get("r1")!, original)).toBe(false)
  })

  it("setUrl updates url, leaves rest", () => {
    const original = makeReq({ url: "https://a.com" })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "setUrl",
      url: "https://b.com",
    })
    const draft = next.get("r1")!
    expect(draft.url).toBe("https://b.com")
    expect(draft.method).toBe(original.method)
    expect(draft.headers).toEqual(original.headers)
  })

  it("setUrl parses query parameters into draft.params (two-way binding)", () => {
    const original = makeReq({ url: "https://a.com", params: [] })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "setUrl",
      url: "https://a.com/search?q=noodle&page=1",
    })
    const draft = next.get("r1")!
    expect(draft.url).toBe("https://a.com/search")
    expect(draft.params).toEqual([
      { name: "q", value: "noodle", enabled: true },
      { name: "page", value: "1", enabled: true },
    ])
  })
  it("setBody updates body", () => {
    const original = makeReq({ body: "x" })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, { kind: "setBody", body: "y" })
    expect(next.get("r1")!.body).toBe("y")
  })
  it("setBody empty string is a real edit (kept in map)", () => {
    const original = makeReq({ body: "x" })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, { kind: "setBody", body: "" })
    expect(next.has("r1")).toBe(true)
    expect(next.get("r1")!.body).toBe("")
  })
  it("setTimeout updates timeout on draft", () => {
    const original = makeReq({ timeout: 0 })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "setTimeout",
      timeout: 30000,
    })
    expect(next.get("r1")!.timeout).toBe(30000)
  })
  it("setHeaderRow replaces i-th entry by insertion order", () => {
    const original = makeReq({
      headers: {
        B: { value: "2", enabled: true },
        A: { value: "1", enabled: true },
      },
    })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "setHeaderRow",
      index: 0,
      key: "B",
      value: "2-modified",
    })
    expect(next.get("r1")!.headers).toEqual({
      B: { value: "2-modified", enabled: true },
      A: { value: "1", enabled: true },
    })
  })
  it("setHeaderRow replaces i-th entry (second row)", () => {
    const original = makeReq({
      headers: {
        B: { value: "2", enabled: true },
        A: { value: "1", enabled: true },
      },
    })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "setHeaderRow",
      index: 1,
      key: "A",
      value: "1-modified",
    })
    expect(next.get("r1")!.headers).toEqual({
      B: { value: "2", enabled: true },
      A: { value: "1-modified", enabled: true },
    })
  })
  it("setHeaderRow with empty key removes the row", () => {
    const original = makeReq({
      headers: {
        A: { value: "1", enabled: true },
        B: { value: "2", enabled: true },
      },
    })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "setHeaderRow",
      index: 0,
      key: "",
      value: "",
    })
    expect(next.get("r1")!.headers).toEqual({
      B: { value: "2", enabled: true },
    })
  })
  it("setHeaderRow with duplicate key overwrites existing entry", () => {
    const original = makeReq({
      headers: {
        A: { value: "1", enabled: true },
        B: { value: "2", enabled: true },
      },
    })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "setHeaderRow",
      index: 0,
      key: "B",
      value: "2-modified",
    })
    expect(next.get("r1")!.headers).toEqual({
      B: { value: "2-modified", enabled: true },
    })
  })
  it("addHeaderRow appends", () => {
    const original = makeReq({ headers: { A: { value: "1", enabled: true } } })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "addHeaderRow",
      key: "B",
      value: "2",
    })
    expect(next.get("r1")!.headers).toEqual({
      A: { value: "1", enabled: true },
      B: { value: "2", enabled: true },
    })
  })
  it("removeHeaderRow deletes by sorted index", () => {
    const original = makeReq({
      headers: {
        A: { value: "1", enabled: true },
        B: { value: "2", enabled: true },
      },
    })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "removeHeaderRow",
      index: 0,
    })
    expect(next.get("r1")!.headers).toEqual({
      B: { value: "2", enabled: true },
    })
  })
  it("removeHeaderRow on last row leaves empty record", () => {
    const original = makeReq({ headers: { A: { value: "1", enabled: true } } })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "removeHeaderRow",
      index: 0,
    })
    expect(next.get("r1")!.headers).toEqual({})
  })
  it("setParamRow / addParamRow / removeParamRow mirror headers", () => {
    const original = makeReq({
      params: [{ name: "q", value: "1", enabled: true }],
    })
    const map = new Map<string, Request>()
    let next = applyDraft(map, "r1", original, {
      kind: "setParamRow",
      index: 0,
      key: "q",
      value: "2",
    })
    expect(next.get("r1")!.params).toEqual([
      { name: "q", value: "2", enabled: true },
    ])
    next = applyDraft(next, "r1", original, {
      kind: "addParamRow",
      key: "p",
      value: "3",
    })
    expect(next.get("r1")!.params).toEqual([
      { name: "q", value: "2", enabled: true },
      { name: "p", value: "3", enabled: true },
    ])
    next = applyDraft(next, "r1", original, {
      kind: "removeParamRow",
      index: 0,
    })
    expect(next.get("r1")!.params).toEqual([
      { name: "p", value: "3", enabled: true },
    ])
  })
  it("revertField body restores body from original", () => {
    const original = makeReq({ body: "orig", bodyType: "json" })
    const map = new Map<string, Request>([
      [
        "r1",
        {
          ...original,
          body: "edited",
          bodyType: "binary",
          filePath: "/tmp/payload.bin",
        },
      ],
    ])
    const next = applyDraft(map, "r1", original, {
      kind: "revertField",
      field: "body",
    })
    expect(next.get("r1")!.body).toBe("orig")
    expect(next.get("r1")!.bodyType).toBe("json")
    expect(next.get("r1")!.filePath).toBeUndefined()
  })
  it("revertField settings restores timeout from original", () => {
    const original = makeReq({ timeout: 5000 })
    const map = new Map<string, Request>([
      ["r1", { ...original, timeout: 30000 }],
    ])
    const next = applyDraft(map, "r1", original, {
      kind: "revertField",
      field: "settings",
    })
    expect(next.get("r1")!.timeout).toBe(5000)
  })
  it("revertField headers row i restores that row from original", () => {
    const original = makeReq({
      headers: {
        A: { value: "1", enabled: true },
        B: { value: "2", enabled: true },
      },
    })
    const map = new Map<string, Request>([
      [
        "r1",
        {
          ...original,
          headers: {
            A: { value: "1-edited", enabled: true },
            B: { value: "2", enabled: true },
          },
        },
      ],
    ])
    const next = applyDraft(map, "r1", original, {
      kind: "revertField",
      field: "headers",
      row: 0,
    })
    expect(next.get("r1")!.headers).toEqual({
      A: { value: "1", enabled: true },
      B: { value: "2", enabled: true },
    })
  })
  it("revertField headers row i removes row if original had fewer rows (added row)", () => {
    const original = makeReq({ headers: { A: { value: "1", enabled: true } } })
    const map = new Map<string, Request>([
      [
        "r1",
        {
          ...original,
          headers: {
            A: { value: "1", enabled: true },
            B: { value: "2", enabled: true },
          },
        },
      ],
    ])
    const next = applyDraft(map, "r1", original, {
      kind: "revertField",
      field: "headers",
      row: 1,
    })
    expect(next.get("r1")!.headers).toEqual({
      A: { value: "1", enabled: true },
    })
  })
  it("revertAll drops the map entry", () => {
    const original = makeReq()
    const map = new Map<string, Request>([
      ["r1", { ...original, url: "edited" }],
    ])
    const next = applyDraft(map, "r1", original, { kind: "revertAll" })
    expect(next.has("r1")).toBe(false)
  })
  it("applyDraft never mutates input map or original", () => {
    const original = makeReq({ url: "https://a.com" })
    const map = new Map<string, Request>()
    const frozenOriginal = JSON.parse(JSON.stringify(original)) as Request
    applyDraft(map, "r1", original, { kind: "setUrl", url: "https://b.com" })
    expect(map.has("r1")).toBe(false)
    expect(requestEquals(original, frozenOriginal)).toBe(true)
  })
  it("per-id preservation: editing id A does not leak into id B", () => {
    const a = makeReq({ id: "a", url: "https://a.com" })
    const b = makeReq({ id: "b", url: "https://b.com" })
    let map = new Map<string, Request>()
    map = applyDraft(map, "a", a, {
      kind: "setUrl",
      url: "https://a-edited.com",
    })
    map = applyDraft(map, "b", b, {
      kind: "setUrl",
      url: "https://b-edited.com",
    })
    expect(map.get("a")!.url).toBe("https://a-edited.com")
    expect(map.get("b")!.url).toBe("https://b-edited.com")
    map = applyDraft(map, "a", a, { kind: "revertAll" })
    expect(map.has("a")).toBe(false)
    expect(map.get("b")!.url).toBe("https://b-edited.com")
  })
  it("toggleHeaderRow flips enabled from true to false", () => {
    const original = makeReq({ headers: { A: { value: "1", enabled: true } } })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "toggleHeaderRow",
      index: 0,
    })
    expect(next.get("r1")!.headers).toEqual({
      A: { value: "1", enabled: false },
    })
  })
  it("toggleHeaderRow flips enabled from false to true", () => {
    const original = makeReq({ headers: { A: { value: "1", enabled: false } } })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "toggleHeaderRow",
      index: 0,
    })
    expect(next.get("r1")!.headers).toEqual({
      A: { value: "1", enabled: true },
    })
  })
  it("toggleParamRow flips enabled", () => {
    const original = makeReq({
      params: [{ name: "q", value: "search", enabled: true }],
    })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "toggleParamRow",
      index: 0,
    })
    expect(next.get("r1")!.params).toEqual([
      { name: "q", value: "search", enabled: false },
    ])
  })
  it("toggle on out-of-range index is no-op", () => {
    const original = makeReq({ headers: { A: { value: "1", enabled: true } } })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "toggleHeaderRow",
      index: 99,
    })
    expect(next.get("r1")!.headers).toEqual({
      A: { value: "1", enabled: true },
    })
  })
  it("setHeaderRow preserves existing enabled state", () => {
    const original = makeReq({ headers: { A: { value: "1", enabled: false } } })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "setHeaderRow",
      index: 0,
      key: "A",
      value: "modified",
    })
    expect(next.get("r1")!.headers).toEqual({
      A: { value: "modified", enabled: false },
    })
  })
  it("addHeaderRow defaults to enabled: true", () => {
    const original = makeReq({ headers: {} })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "addHeaderRow",
      key: "X-New",
      value: "v",
    })
    expect(next.get("r1")!.headers).toEqual({
      "X-New": { value: "v", enabled: true },
    })
  })
  it("removeHeaderRow still works with KvEntry", () => {
    const original = makeReq({
      headers: {
        A: { value: "1", enabled: true },
        B: { value: "2", enabled: false },
      },
    })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "removeHeaderRow",
      index: 0,
    })
    expect(next.get("r1")!.headers).toEqual({
      B: { value: "2", enabled: false },
    })
  })
  it("revertField headers row i restores original enabled state", () => {
    const original = makeReq({
      headers: {
        A: { value: "1", enabled: true },
        B: { value: "2", enabled: false },
      },
    })
    const map = new Map<string, Request>([
      [
        "r1",
        {
          ...original,
          headers: {
            A: { value: "1-edited", enabled: false },
            B: { value: "2", enabled: false },
          },
        },
      ],
    ])
    const next = applyDraft(map, "r1", original, {
      kind: "revertField",
      field: "headers",
      row: 0,
    })
    expect(next.get("r1")!.headers).toEqual({
      A: { value: "1", enabled: true },
      B: { value: "2", enabled: false },
    })
  })
})

describe("removeRequestDraftEntry", () => {
  it("deletes a specific draft entry without touching others", () => {
    const map = new Map<string, number>([
      ["a", 1],
      ["b", 2],
    ])
    const next = removeRequestDraftEntry(map, "a")
    expect(next.has("a")).toBe(false)
    expect(next.get("b")).toBe(2)
    expect(map.has("a")).toBe(true)
  })
})

describe("syncUrlParams", () => {
  it("sets url to base URL and params from query string", () => {
    const original = makeReq({ url: "https://example.com/posts", params: [] })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "syncUrlParams",
      rawUrl: "https://example.com/posts?userId=1&limit=10",
    })
    expect(next.get("r1")!.url).toBe("https://example.com/posts")
    expect(next.get("r1")!.params).toEqual([
      { name: "userId", value: "1", enabled: true },
      { name: "limit", value: "10", enabled: true },
    ])
  })

  it("replaces existing params with those from URL query", () => {
    const original = makeReq({
      url: "https://example.com/posts",
      params: [
        { name: "old", value: "x", enabled: true },
        { name: "stale", value: "y", enabled: true },
      ],
    })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "syncUrlParams",
      rawUrl: "https://example.com/posts?new=z",
    })
    expect(next.get("r1")!.url).toBe("https://example.com/posts")
    expect(next.get("r1")!.params).toEqual([
      { name: "new", value: "z", enabled: true },
    ])
  })

  it("clears params when URL has no query string", () => {
    const original = makeReq({
      url: "https://example.com/old?x=1",
      params: [{ name: "y", value: "2", enabled: true }],
    })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "syncUrlParams",
      rawUrl: "https://example.com/clean",
    })
    expect(next.get("r1")!.url).toBe("https://example.com/clean")
    expect(next.get("r1")!.params).toEqual([])
  })

  it("preserves other draft fields unchanged", () => {
    const original = makeReq({
      url: "https://example.com/posts",
      method: "POST",
      body: "hello",
      headers: { "Content-Type": { value: "application/json", enabled: true } },
    })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "syncUrlParams",
      rawUrl: "https://example.com/posts?key=val",
    })
    expect(next.get("r1")!.method).toBe("POST")
    expect(next.get("r1")!.body).toBe("hello")
    expect(next.get("r1")!.headers).toEqual({
      "Content-Type": { value: "application/json", enabled: true },
    })
  })

  it("handles single query param", () => {
    const original = makeReq({ url: "https://example.com", params: [] })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "syncUrlParams",
      rawUrl: "https://example.com?q=hello",
    })
    expect(next.get("r1")!.url).toBe("https://example.com")
    expect(next.get("r1")!.params).toEqual([
      { name: "q", value: "hello", enabled: true },
    ])
  })

  it("handles URL with existing query and explicit params (both replaced)", () => {
    const original = makeReq({
      url: "https://example.com/api?old=1",
      params: [{ name: "manual", value: "2", enabled: true }],
    })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "syncUrlParams",
      rawUrl: "https://example.com/api?v=3",
    })
    expect(next.get("r1")!.url).toBe("https://example.com/api")
    expect(next.get("r1")!.params).toEqual([
      { name: "v", value: "3", enabled: true },
    ])
  })

  it("never mutates input map", () => {
    const original = makeReq({ url: "https://example.com", params: [] })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "syncUrlParams",
      rawUrl: "https://example.com?x=1",
    })
    expect(next).not.toBe(map)
    expect(map.size).toBe(0)
  })

  it("never mutates original request", () => {
    const original = makeReq({ url: "https://example.com", params: [] })
    const originalCopy = { ...original, params: [...original.params] }
    const map = new Map<string, Request>()
    applyDraft(map, "r1", original, {
      kind: "syncUrlParams",
      rawUrl: "https://example.com?x=1",
    })
    expect(original).toEqual(originalCopy)
  })
})

describe("isDirty with originalMap", () => {
  it("returns false when draft equals originalMap entry", () => {
    const original = makeReq({ url: "https://a.com" })
    const originalMap = new Map([["r1", original]])
    const draft = { ...original }
    expect(requestEquals(draft, originalMap.get("r1")!)).toBe(true)
  })
  it("returns true when draft differs from originalMap entry", () => {
    const original = makeReq({ url: "https://a.com" })
    const originalMap = new Map([["r1", original]])
    const draft = { ...original, url: "https://b.com" }
    expect(requestEquals(draft, originalMap.get("r1")!)).toBe(false)
  })
  it("remains dirty after editing when originalMap has saved version", () => {
    const selectedRequest = makeReq({ url: "https://a.com" })
    const savedCopy = { ...selectedRequest, url: "https://b.com" }
    const originalMap = new Map([["r1", savedCopy]])
    const draft = { ...savedCopy, url: "https://c.com" }
    // draft differs from savedCopy (originalMap entry) → dirty
    expect(requestEquals(draft, originalMap.get("r1")!)).toBe(false)
  })
  it("falls back to selectedRequest when id not in originalMap", () => {
    const selectedRequest = makeReq()
    const originalMap = new Map<string, Request>()
    const draft = { ...selectedRequest }
    const saved = originalMap.get("r1") ?? selectedRequest
    expect(requestEquals(draft, saved)).toBe(true)
  })
})

describe("applyDraft — auth", () => {
  it("setAuthType none -> none (no change)", () => {
    const original = makeReq({ auth: { type: "none" } })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "setAuthType",
      authType: "none",
    })
    expect(next.get("r1")!.auth).toEqual({ type: "none" })
  })

  it("setAuthType none -> bearer resets token to empty", () => {
    const original = makeReq({ auth: { type: "none" } })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "setAuthType",
      authType: "bearer",
    })
    expect(next.get("r1")!.auth).toEqual({ type: "bearer", token: "" })
  })

  it("setAuthType bearer -> basic resets to empty user/pass", () => {
    const original = makeReq({ auth: { type: "bearer", token: "old" } })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "setAuthType",
      authType: "basic",
    })
    expect(next.get("r1")!.auth).toEqual({ type: "basic", user: "", pass: "" })
  })

  it("setAuthType basic -> api_key resets to empty with default placement", () => {
    const original = makeReq({ auth: { type: "basic", user: "u", pass: "p" } })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "setAuthType",
      authType: "api_key",
    })
    expect(next.get("r1")!.auth).toEqual({
      type: "api_key",
      key: "",
      value: "",
      placement: "header",
    })
  })

  it("setAuthField sets bearer token", () => {
    const original = makeReq({ auth: { type: "bearer", token: "old" } })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "setAuthField",
      authType: "bearer",
      field: "token",
      value: "new-secret",
    })
    expect(next.get("r1")!.auth).toEqual({
      type: "bearer",
      token: "new-secret",
    })
    expect(original.auth).toEqual({ type: "bearer", token: "old" })
  })

  it("setAuthField sets basic user", () => {
    const original = makeReq({
      auth: { type: "basic", user: "old", pass: "p" },
    })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "setAuthField",
      authType: "basic",
      field: "user",
      value: "admin",
    })
    expect(next.get("r1")!.auth).toEqual({
      type: "basic",
      user: "admin",
      pass: "p",
    })
  })

  it("setAuthField sets basic pass", () => {
    const original = makeReq({
      auth: { type: "basic", user: "u", pass: "old" },
    })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "setAuthField",
      authType: "basic",
      field: "pass",
      value: "new-pass",
    })
    expect(next.get("r1")!.auth).toEqual({
      type: "basic",
      user: "u",
      pass: "new-pass",
    })
  })

  it("setAuthField sets api_key key", () => {
    const original = makeReq({
      auth: { type: "api_key", key: "", value: "", placement: "header" },
    })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "setAuthField",
      authType: "api_key",
      field: "key",
      value: "X-API-Key",
    })
    expect(next.get("r1")!.auth).toEqual({
      type: "api_key",
      key: "X-API-Key",
      value: "",
      placement: "header",
    })
  })

  it("setAuthField sets api_key value", () => {
    const original = makeReq({
      auth: { type: "api_key", key: "k", value: "", placement: "header" },
    })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "setAuthField",
      authType: "api_key",
      field: "value",
      value: "secret",
    })
    expect(next.get("r1")!.auth).toEqual({
      type: "api_key",
      key: "k",
      value: "secret",
      placement: "header",
    })
  })

  it("setApiKeyPlacement toggles placement", () => {
    const original = makeReq({
      auth: { type: "api_key", key: "k", value: "v", placement: "header" },
    })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "setApiKeyPlacement",
      placement: "query",
    })
    expect(next.get("r1")!.auth).toEqual({
      type: "api_key",
      key: "k",
      value: "v",
      placement: "query",
    })
    expect(original.auth).toEqual({
      type: "api_key",
      key: "k",
      value: "v",
      placement: "header",
    })
  })

  it("setAuthField no-ops when authType doesn't match", () => {
    const original = makeReq({ auth: { type: "bearer", token: "t" } })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "setAuthField",
      authType: "basic",
      field: "user",
      value: "x",
    })
    expect(next.get("r1")!.auth).toEqual({ type: "bearer", token: "t" })
  })

  it("revertField auth row 0 reverts entire auth", () => {
    const original = makeReq({ auth: { type: "bearer", token: "orig" } })
    const map = new Map<string, Request>([
      ["r1", { ...original, auth: { type: "bearer", token: "edited" } }],
    ])
    const next = applyDraft(map, "r1", original, {
      kind: "revertField",
      field: "auth",
      row: 0,
    })
    expect(next.get("r1")!.auth).toEqual({ type: "bearer", token: "orig" })
  })
})

describe("authEqual — api_key", () => {
  it("same api_key -> true", () => {
    const a = makeReq({
      auth: { type: "api_key", key: "k", value: "v", placement: "header" },
    })
    const b = makeReq({
      auth: { type: "api_key", key: "k", value: "v", placement: "header" },
    })
    expect(requestEquals(a, b)).toBe(true)
  })
  it("different api_key key -> false", () => {
    const a = makeReq({
      auth: { type: "api_key", key: "k1", value: "v", placement: "header" },
    })
    const b = makeReq({
      auth: { type: "api_key", key: "k2", value: "v", placement: "header" },
    })
    expect(requestEquals(a, b)).toBe(false)
  })
  it("different api_key placement -> false", () => {
    const a = makeReq({
      auth: { type: "api_key", key: "k", value: "v", placement: "header" },
    })
    const b = makeReq({
      auth: { type: "api_key", key: "k", value: "v", placement: "query" },
    })
    expect(requestEquals(a, b)).toBe(false)
  })
})
