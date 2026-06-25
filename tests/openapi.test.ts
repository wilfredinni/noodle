import { describe, it, expect } from "bun:test"
import { parseSpec, mapCollection } from "../src/converters/openapi"
import type { Normalized } from "../src/converters/openapi"

describe("parseSpec — string/object dispatch + validation", () => {
  it("passes an object input through unchanged (no re-parse)", () => {
    const spec = { openapi: "3.0.0", paths: {} }
    const n = parseSpec(spec)
    expect(n.openapi).toBe("3.0.0")
    expect(n.paths).toEqual({})
  })

  it("parses a JSON string", () => {
    const text = JSON.stringify({ openapi: "3.0.0", paths: { "/x": {} } })
    const n = parseSpec(text)
    expect(n.openapi).toBe("3.0.0")
    expect(Object.keys(n.paths)).toEqual(["/x"])
  })

  it("parses a YAML string (JSON.parse fails, YAML superset succeeds)", () => {
    const text = 'openapi: "3.0.0"\npaths: {}\n'
    const n = parseSpec(text)
    expect(n.openapi).toBe("3.0.0")
    expect(n.paths).toEqual({})
  })

  it("throws on a string that is neither valid JSON nor valid YAML", () => {
    const text = ": : :"
    let err: Error | undefined
    try {
      parseSpec(text)
    } catch (e) {
      err = e as Error
    }
    expect(err).toBeInstanceOf(Error)
    expect(err?.message).toContain(
      "converters.openapi.import: failed to parse spec (not valid JSON or YAML):",
    )
    expect(err?.cause).toBeDefined()
  })

  it("throws when parsed root is an array", () => {
    const text = JSON.stringify([{ openapi: "3.0.0", paths: {} }])
    expect(() => parseSpec(text)).toThrow(
      "converters.openapi.import: spec root must be a mapping",
    )
  })

  it("throws when parsed root is a primitive", () => {
    expect(() => parseSpec('"hello"')).toThrow(
      "converters.openapi.import: spec root must be a mapping",
    )
  })

  it("throws when openapi field is missing", () => {
    expect(() => parseSpec({ paths: {} } as object)).toThrow(
      'converters.openapi.import: missing "openapi" field',
    )
  })

  it("throws when openapi field is not a string", () => {
    expect(() => parseSpec({ openapi: 3.0, paths: {} } as object)).toThrow(
      'converters.openapi.import: missing "openapi" field',
    )
  })

  it("throws on openapi 2.0", () => {
    expect(() => parseSpec({ openapi: "2.0", paths: {} } as object)).toThrow(
      'converters.openapi.import: unsupported openapi version "2.0", expected 3.0.x',
    )
  })

  it("throws on openapi 3.1.0", () => {
    expect(() => parseSpec({ openapi: "3.1.0", paths: {} } as object)).toThrow(
      'converters.openapi.import: unsupported openapi version "3.1.0", expected 3.0.x',
    )
  })

  it("throws when paths is missing", () => {
    expect(() => parseSpec({ openapi: "3.0.0" } as object)).toThrow(
      'converters.openapi.import: missing or invalid "paths"',
    )
  })

  it("throws when paths is an array", () => {
    expect(() => parseSpec({ openapi: "3.0.0", paths: [] } as object)).toThrow(
      'converters.openapi.import: missing or invalid "paths"',
    )
  })

  it("accepts empty paths (returns Normalized with empty paths map)", () => {
    const n = parseSpec({ openapi: "3.0.0", paths: {} } as object)
    expect(n.paths).toEqual({})
  })
})

function makeNormalized(over: Partial<Normalized> = {}): Normalized {
  return {
    openapi: "3.0.0",
    info: { title: "Test API" },
    servers: [{ url: "https://api.example.com" }],
    paths: {},
    security: [],
    components: { securitySchemes: {} },
    ...over,
  } as Normalized
}

describe("mapCollection — Collection metadata", () => {
  it("derives name and id from info.title", () => {
    const c = mapCollection(makeNormalized({ info: { title: "My Cool API!" } }))
    expect(c.name).toBe("My Cool API!")
    expect(c.id).toBe("my-cool-api")
  })

  it("falls back when info.title is empty string", () => {
    const c = mapCollection(makeNormalized({ info: { title: "" } }))
    expect(c.name).toBe("openapi-import")
    expect(c.id).toBe("openapi-import")
  })

  it("falls back when info is missing entirely", () => {
    const c = mapCollection(makeNormalized({ info: undefined }))
    expect(c.name).toBe("openapi-import")
    expect(c.id).toBe("openapi-import")
  })

  it("falls back when info.title is not a string", () => {
    const c = mapCollection(makeNormalized({ info: { title: 42 } }))
    expect(c.name).toBe("openapi-import")
    expect(c.id).toBe("openapi-import")
  })

  it("falls back when title is all punctuation (slug empty)", () => {
    const c = mapCollection(makeNormalized({ info: { title: "!!!" } }))
    expect(c.name).toBe("!!!")
    expect(c.id).toBe("openapi-import")
  })

  it("returns an empty requests array when paths is empty", () => {
    const c = mapCollection(makeNormalized())
    expect(c.requests).toEqual([])
  })
})

describe("mapCollection — operations & methods", () => {
  it("produces one Request per non-trace operation", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/users": {
            get: { operationId: "listUsers" },
            post: { operationId: "createUser" },
            trace: {},
          },
          "/items/{id}": {
            get: { summary: "Get an item" },
          },
        },
      }),
    )
    expect(c.requests).toHaveLength(3)
    expect(c.requests.map((r) => r.method)).toEqual(["GET", "POST", "GET"])
  })

  it("uses deterministic method order (METHOD_KEYS) regardless of spec key order", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/x": {
            post: { operationId: "postX" },
            get: { operationId: "getX" },
          },
        },
      }),
    )
    expect(c.requests.map((r) => r.method)).toEqual(["GET", "POST"])
  })

  it("skips pathItem that is not a mapping", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/x": "not a mapping",
          "/y": { get: { operationId: "getY" } },
        },
      }),
    )
    expect(c.requests).toHaveLength(1)
    expect(c.requests[0].name).toBe("getY")
  })

  it("skips an op value that is not a mapping", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/x": {
            get: "not a mapping",
            post: { operationId: "postX" },
          },
        },
      }),
    )
    expect(c.requests).toHaveLength(1)
    expect(c.requests[0].method).toBe("POST")
  })

  it("ignores non-method keys at the pathItem level (parameters, summary)", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/x": {
            parameters: [],
            summary: "path summary",
            get: { operationId: "getX" },
          },
        },
      }),
    )
    expect(c.requests).toHaveLength(1)
  })

  it("builds the url from base + path with var substitution", () => {
    const c = mapCollection(
      makeNormalized({
        servers: [{ url: "https://api.example.com/v1" }],
        paths: {
          "/users/{id}": { get: { operationId: "getUser" } },
        },
      }),
    )
    expect(c.requests[0].url).toBe("https://api.example.com/v1/users/{{id}}")
  })

  it("builds a path-only url when servers is missing", () => {
    const c = mapCollection(
      makeNormalized({
        servers: undefined,
        paths: {
          "/users/{id}": { get: { operationId: "getUser" } },
        },
      }),
    )
    expect(c.requests[0].url).toBe("/users/{{id}}")
  })

  it("initializes headers, params as empty and body as undefined and auth as none", () => {
    const c = mapCollection(
      makeNormalized({
        paths: { "/x": { get: { operationId: "getX" } } },
      }),
    )
    const r = c.requests[0]
    expect(r.headers).toEqual({})
    expect(r.params).toEqual({})
    expect(r.body).toBeUndefined()
    expect(r.auth).toEqual({ type: "none" })
  })
})

describe("mapCollection — name derivation and id dedupe", () => {
  it("uses operationId for name when present", () => {
    const c = mapCollection(
      makeNormalized({
        paths: { "/x": { get: { operationId: "getX", summary: "ignored" } } },
      }),
    )
    expect(c.requests[0].name).toBe("getX")
  })

  it("falls back to summary when operationId is missing", () => {
    const c = mapCollection(
      makeNormalized({
        paths: { "/x": { get: { summary: "Get the X" } } },
      }),
    )
    expect(c.requests[0].name).toBe("Get the X")
  })

  it("falls back to METHOD path when operationId and summary are missing", () => {
    const c = mapCollection(
      makeNormalized({
        paths: { "/x/{id}": { get: {} } },
      }),
    )
    expect(c.requests[0].name).toBe("GET /x/{id}")
  })

  it("ignores non-string operationId", () => {
    const c = mapCollection(
      makeNormalized({
        paths: { "/x": { get: { operationId: 123, summary: "Get X" } } },
      }),
    )
    expect(c.requests[0].name).toBe("Get X")
  })

  it("ignores empty-string operationId", () => {
    const c = mapCollection(
      makeNormalized({
        paths: { "/x": { get: { operationId: "", summary: "Get X" } } },
      }),
    )
    expect(c.requests[0].name).toBe("Get X")
  })

  it("ignores non-string summary", () => {
    const c = mapCollection(
      makeNormalized({
        paths: { "/x": { get: { summary: 42 } } },
      }),
    )
    expect(c.requests[0].name).toBe("GET /x")
  })

  it("derives id from method+path slug with braces stripped", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/users/{id}/items/{itemId}": { get: { operationId: "getItem" } },
        },
      }),
    )
    expect(c.requests[0].id).toBe("get-users-id-items-itemid")
  })

  it("dedupes identical ids with -2 suffix when two paths lowercased collide", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/USERS": {
            get: { operationId: "listUsersUpper" },
            post: { operationId: "createUserUpper" },
          },
          "/users": {
            get: { operationId: "listUsersLower" },
          },
        },
      }),
    )
    const ids = c.requests.map((r) => r.id)
    expect(ids).toContain("get-users")
    expect(ids).toContain("get-users-2")
    expect(ids).toContain("post-users")
  })

  it("dedupes to -3 for a third collision", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/USERS": { get: { operationId: "a" } },
          "/users": { get: { operationId: "b" } },
          "/Users": { get: { operationId: "c" } },
        },
      }),
    )
    const ids = c.requests.map((r) => r.id).sort()
    expect(ids).toEqual(["get-users", "get-users-2", "get-users-3"])
  })
})
