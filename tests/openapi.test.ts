import { describe, it, expect } from "bun:test"
import { parseSpec, mapCollection } from "../src/converters/openapi"
import type { Normalized } from "../src/converters/openapi"
import type { Request, Collection } from "../src/schema"

function reqs(result: { collection: Collection }): Request[] {
  function flatten(
    items: { collection: Collection }["collection"]["items"],
  ): Request[] {
    const out: Request[] = []
    for (const item of items) {
      if (item.type === "request") {
        out.push(item.data)
      } else if (item.type === "folder") {
        out.push(...flatten(item.data.children))
      }
    }
    return out
  }
  return flatten(result.collection.items)
}

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
    expect(c.collection.name).toBe("My Cool API!")
    expect(c.collection.id).toBe("my-cool-api")
  })

  it("falls back when info.title is empty string", () => {
    const c = mapCollection(makeNormalized({ info: { title: "" } }))
    expect(c.collection.name).toBe("openapi-import")
    expect(c.collection.id).toBe("openapi-import")
  })

  it("falls back when info is missing entirely", () => {
    const c = mapCollection(makeNormalized({ info: undefined }))
    expect(c.collection.name).toBe("openapi-import")
    expect(c.collection.id).toBe("openapi-import")
  })

  it("falls back when info.title is not a string", () => {
    const c = mapCollection(makeNormalized({ info: { title: 42 } }))
    expect(c.collection.name).toBe("openapi-import")
    expect(c.collection.id).toBe("openapi-import")
  })

  it("falls back when title is all punctuation (slug empty)", () => {
    const c = mapCollection(makeNormalized({ info: { title: "!!!" } }))
    expect(c.collection.name).toBe("!!!")
    expect(c.collection.id).toBe("openapi-import")
  })

  it("returns an empty requests array when paths is empty", () => {
    const c = mapCollection(makeNormalized())
    expect(reqs(c)).toEqual([])
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
    expect(reqs(c)).toHaveLength(3)
    expect(reqs(c).map((r) => r.method)).toEqual(["GET", "POST", "GET"])
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
    expect(reqs(c).map((r) => r.method)).toEqual(["GET", "POST"])
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
    expect(reqs(c)).toHaveLength(1)
    expect(reqs(c)[0].name).toBe("getY")
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
    expect(reqs(c)).toHaveLength(1)
    expect(reqs(c)[0].method).toBe("POST")
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
    expect(reqs(c)).toHaveLength(1)
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
    expect(reqs(c)[0].url).toBe("https://api.example.com/v1/users/$id")
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
    expect(reqs(c)[0].url).toBe("/users/$id")
  })

  it("initializes headers, params as empty and body as undefined and auth as none", () => {
    const c = mapCollection(
      makeNormalized({
        paths: { "/x": { get: { operationId: "getX" } } },
      }),
    )
    const r = reqs(c)[0]
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
    expect(reqs(c)[0].name).toBe("getX")
  })

  it("falls back to summary when operationId is missing", () => {
    const c = mapCollection(
      makeNormalized({
        paths: { "/x": { get: { summary: "Get the X" } } },
      }),
    )
    expect(reqs(c)[0].name).toBe("Get the X")
  })

  it("falls back to METHOD path when operationId and summary are missing", () => {
    const c = mapCollection(
      makeNormalized({
        paths: { "/x/{id}": { get: {} } },
      }),
    )
    expect(reqs(c)[0].name).toBe("GET /x/{id}")
  })

  it("ignores non-string operationId", () => {
    const c = mapCollection(
      makeNormalized({
        paths: { "/x": { get: { operationId: 123, summary: "Get X" } } },
      }),
    )
    expect(reqs(c)[0].name).toBe("Get X")
  })

  it("ignores empty-string operationId", () => {
    const c = mapCollection(
      makeNormalized({
        paths: { "/x": { get: { operationId: "", summary: "Get X" } } },
      }),
    )
    expect(reqs(c)[0].name).toBe("Get X")
  })

  it("ignores non-string summary", () => {
    const c = mapCollection(
      makeNormalized({
        paths: { "/x": { get: { summary: 42 } } },
      }),
    )
    expect(reqs(c)[0].name).toBe("GET /x")
  })

  it("derives id from method+path slug with braces stripped", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/users/{id}/items/{itemId}": { get: { operationId: "getItem" } },
        },
      }),
    )
    expect(reqs(c)[0].id).toBe("get-users-id-items-itemid")
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
    const ids = reqs(c).map((r) => r.id)
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
    const ids = reqs(c)
      .map((r) => r.id)
      .sort()
    expect(ids).toEqual(["get-users", "get-users-2", "get-users-3"])
  })
})

describe("mapCollection — auth resolution", () => {
  const bearer = { type: "http", scheme: "bearer" }
  const basic = { type: "http", scheme: "basic" }
  const apiKeyHeader = { type: "apiKey", in: "header", name: "X-Api-Key" }
  const oauth2 = { type: "oauth2", flows: {} }
  const oidc = { type: "openIdConnect", openIdConnectUrl: "https://x" }

  it("maps http+bearer to Auth=bearer with $TOKEN", () => {
    const c = mapCollection(
      makeNormalized({
        components: { securitySchemes: { bearerAuth: bearer } },
        security: [{ bearerAuth: [] }],
        paths: { "/x": { get: { operationId: "getX" } } },
      }),
    )
    expect(reqs(c)[0].auth).toEqual({ type: "bearer", token: "$TOKEN" })
  })

  it("maps http+basic to Auth=basic with $USER $PASS", () => {
    const c = mapCollection(
      makeNormalized({
        components: { securitySchemes: { basicAuth: basic } },
        security: [{ basicAuth: [] }],
        paths: { "/x": { get: { operationId: "getX" } } },
      }),
    )
    expect(reqs(c)[0].auth).toEqual({
      type: "basic",
      user: "$USER",
      pass: "$PASS",
    })
  })

  it("maps apiKey header scheme", () => {
    const c = mapCollection(
      makeNormalized({
        components: { securitySchemes: { key: apiKeyHeader } },
        security: [{ key: [] }],
        paths: { "/x": { get: { operationId: "getX" } } },
      }),
    )
    expect(reqs(c)[0].auth).toEqual({
      type: "api_key",
      key: "X-Api-Key",
      value: "$API_KEY",
      placement: "header",
    })
  })

  it("maps apiKey query scheme", () => {
    const c = mapCollection(
      makeNormalized({
        components: {
          securitySchemes: {
            key: { type: "apiKey", in: "query", name: "api_key" },
          },
        },
        security: [{ key: [] }],
        paths: { "/x": { get: { operationId: "getX" } } },
      }),
    )
    expect(reqs(c)[0].auth).toEqual({
      type: "api_key",
      key: "api_key",
      value: "$API_KEY",
      placement: "query",
    })
  })

  it("maps oauth2 to none", () => {
    const c = mapCollection(
      makeNormalized({
        components: { securitySchemes: { oauth: oauth2 } },
        security: [{ oauth: [] }],
        paths: { "/x": { get: { operationId: "getX" } } },
      }),
    )
    expect(reqs(c)[0].auth).toEqual({ type: "none" })
  })

  it("maps openIdConnect to none", () => {
    const c = mapCollection(
      makeNormalized({
        components: { securitySchemes: { oidc: oidc } },
        security: [{ oidc: [] }],
        paths: { "/x": { get: { operationId: "getX" } } },
      }),
    )
    expect(reqs(c)[0].auth).toEqual({ type: "none" })
  })

  it("op.security overrides global security", () => {
    const c = mapCollection(
      makeNormalized({
        components: {
          securitySchemes: { bearerAuth: bearer, basicAuth: basic },
        },
        security: [{ bearerAuth: [] }],
        paths: {
          "/x": { get: { operationId: "getX", security: [{ basicAuth: [] }] } },
        },
      }),
    )
    expect(reqs(c)[0].auth).toEqual({
      type: "basic",
      user: "$USER",
      pass: "$PASS",
    })
  })

  it("op inherits global security when no op.security", () => {
    const c = mapCollection(
      makeNormalized({
        components: { securitySchemes: { bearerAuth: bearer } },
        security: [{ bearerAuth: [] }],
        paths: { "/x": { get: { operationId: "getX" } } },
      }),
    )
    expect(reqs(c)[0].auth).toEqual({ type: "bearer", token: "$TOKEN" })
  })

  it("op.security: [] (empty array) means no auth required", () => {
    const c = mapCollection(
      makeNormalized({
        components: { securitySchemes: { bearerAuth: bearer } },
        security: [{ bearerAuth: [] }],
        paths: { "/x": { get: { operationId: "getX", security: [] } } },
      }),
    )
    expect(reqs(c)[0].auth).toEqual({ type: "none" })
  })

  it("falls to none when security requirement references an unknown scheme", () => {
    const c = mapCollection(
      makeNormalized({
        components: { securitySchemes: {} },
        security: [{ missingScheme: [] }],
        paths: { "/x": { get: { operationId: "getX" } } },
      }),
    )
    expect(reqs(c)[0].auth).toEqual({ type: "none" })
  })

  it("falls to none when securitySchemes is missing entirely", () => {
    const c = mapCollection(
      makeNormalized({
        components: undefined,
        security: [{ bearerAuth: [] }],
        paths: { "/x": { get: { operationId: "getX" } } },
      }),
    )
    expect(reqs(c)[0].auth).toEqual({ type: "none" })
  })

  it("tries the next requirement when prior requirement has no usable scheme", () => {
    const c = mapCollection(
      makeNormalized({
        components: {
          securitySchemes: { oauth: oauth2, bearerAuth: bearer },
        },
        security: [{ oauth: [] }, { bearerAuth: [] }],
        paths: { "/x": { get: { operationId: "getX" } } },
      }),
    )
    expect(reqs(c)[0].auth).toEqual({ type: "bearer", token: "$TOKEN" })
  })

  it("falls to none when no security anywhere", () => {
    const c = mapCollection(
      makeNormalized({
        components: { securitySchemes: { bearerAuth: bearer } },
        security: undefined,
        paths: { "/x": { get: { operationId: "getX" } } },
      }),
    )
    expect(reqs(c)[0].auth).toEqual({ type: "none" })
  })

  it("skips a security requirement that is not a mapping", () => {
    const c = mapCollection(
      makeNormalized({
        components: { securitySchemes: { bearerAuth: bearer } },
        security: ["not a mapping", { bearerAuth: [] }],
        paths: { "/x": { get: { operationId: "getX" } } },
      }),
    )
    expect(reqs(c)[0].auth).toEqual({ type: "bearer", token: "$TOKEN" })
  })

  it("skips security requirement entries whose scheme name is not a string", () => {
    const c = mapCollection(
      makeNormalized({
        components: { securitySchemes: { bearerAuth: bearer } },
        security: [{ 123: [] }, { bearerAuth: [] }],
        paths: { "/x": { get: { operationId: "getX" } } },
      }),
    )
    expect(reqs(c)[0].auth).toEqual({ type: "bearer", token: "$TOKEN" })
  })
})

describe("mapCollection — parameters", () => {
  it("translates in:query params to params as $name placeholders", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/search": {
            get: {
              operationId: "search",
              parameters: [
                { name: "q", in: "query" },
                { name: "limit", in: "query" },
              ],
            },
          },
        },
      }),
    )
    expect(reqs(c)[0].params).toEqual({
      q: { value: "", enabled: true },
      limit: { value: "", enabled: true },
    })
  })

  it("translates in:header params to headers as $name placeholders", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/x": {
            get: {
              operationId: "getX",
              parameters: [{ name: "X-Custom", in: "header" }],
            },
          },
        },
      }),
    )
    expect(reqs(c)[0].headers).toEqual({
      "X-Custom": { value: "", enabled: true },
    })
  })

  it("ignores in:cookie params", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/x": {
            get: {
              operationId: "getX",
              parameters: [{ name: "session", in: "cookie" }],
            },
          },
        },
      }),
    )
    expect(reqs(c)[0].headers).toEqual({})
    expect(reqs(c)[0].params).toEqual({})
  })

  it("does not duplicate path params (in:path is a no-op; already in url)", () => {
    const c = mapCollection(
      makeNormalized({
        servers: [],
        paths: {
          "/users/{id}/items/{itemId}": {
            get: {
              operationId: "getItem",
              parameters: [
                { name: "id", in: "path" },
                { name: "itemId", in: "path" },
              ],
            },
          },
        },
      }),
    )
    expect(reqs(c)[0].params).toEqual({})
    expect(reqs(c)[0].headers).toEqual({})
    expect(reqs(c)[0].url).toBe("/users/$id/items/$itemId")
  })

  it("skips a param with missing name", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/x": {
            get: {
              operationId: "getX",
              parameters: [{ in: "query" }, { name: "good", in: "query" }],
            },
          },
        },
      }),
    )
    expect(reqs(c)[0].params).toEqual({
      good: { value: "", enabled: true },
    })
  })

  it("skips a param with non-string name", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/x": {
            get: {
              operationId: "getX",
              parameters: [
                { name: 42, in: "query" },
                { name: "good", in: "query" },
              ],
            },
          },
        },
      }),
    )
    expect(reqs(c)[0].params).toEqual({
      good: { value: "", enabled: true },
    })
  })

  it("skips a param with invalid in", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/x": {
            get: {
              operationId: "getX",
              parameters: [
                { name: "bad", in: "formData" },
                { name: "good", in: "query" },
              ],
            },
          },
        },
      }),
    )
    expect(reqs(c)[0].params).toEqual({
      good: { value: "", enabled: true },
    })
  })

  it("skips a param that is not a mapping", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/x": {
            get: {
              operationId: "getX",
              parameters: ["not a mapping", { name: "good", in: "query" }],
            },
          },
        },
      }),
    )
    expect(reqs(c)[0].params).toEqual({
      good: { value: "", enabled: true },
    })
  })

  it("skips a param with empty-string name", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/x": {
            get: {
              operationId: "getX",
              parameters: [
                { name: "", in: "query" },
                { name: "good", in: "query" },
              ],
            },
          },
        },
      }),
    )
    expect(reqs(c)[0].params).toEqual({
      good: { value: "", enabled: true },
    })
  })

  it("applies pathItem-level parameters to all ops in that pathItem", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/x": {
            parameters: [{ name: "shared", in: "query" }],
            get: { operationId: "getX" },
            post: { operationId: "postX" },
          },
        },
      }),
    )
    expect(reqs(c)[0].params).toEqual({
      shared: { value: "", enabled: true },
    })
    expect(reqs(c)[1].params).toEqual({
      shared: { value: "", enabled: true },
    })
  })

  it("op-level params override pathItem-level params by name+in", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/x": {
            parameters: [{ name: "shared", in: "query" }],
            get: {
              operationId: "getX",
              parameters: [
                { name: "shared", in: "query" },
                { name: "extra", in: "query" },
              ],
            },
          },
        },
      }),
    )
    expect(reqs(c)[0].params).toEqual({
      shared: { value: "", enabled: true },
      extra: { value: "", enabled: true },
    })
  })

  it("op-level param does NOT override pathItem-level when in differs (different slot)", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/x": {
            parameters: [{ name: "alpha", in: "query" }],
            get: {
              operationId: "getX",
              parameters: [{ name: "alpha", in: "header" }],
            },
          },
        },
      }),
    )
    expect(reqs(c)[0].params).toEqual({
      alpha: { value: "", enabled: true },
    })
    expect(reqs(c)[0].headers).toEqual({
      alpha: { value: "", enabled: true },
    })
  })

  it("uses the last param when name+in is duplicated within the same list", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/x": {
            get: {
              operationId: "getX",
              parameters: [
                { name: "dup", in: "query" },
                { name: "dup", in: "query" },
              ],
            },
          },
        },
      }),
    )
    expect(Object.keys(reqs(c)[0].params)).toEqual(["dup"])
  })
})

describe("mapCollection — end-to-end integration", () => {
  it("converts a representative v3.0 spec to a Collection", () => {
    const spec = {
      openapi: "3.0.3",
      info: { title: "Pet Store API" },
      servers: [{ url: "https://{host}/v1" }],
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer" },
          basicAuth: { type: "http", scheme: "basic" },
          apiKey: { type: "apiKey", in: "header", name: "X-Key" },
        },
      },
      security: [{ bearerAuth: [] }],
      paths: {
        "/pets/{petId}": {
          parameters: [{ name: "petId", in: "path" }],
          get: {
            operationId: "getPet",
            parameters: [
              { name: "verbose", in: "query" },
              { name: "X-Trace", in: "header" },
            ],
          },
          delete: {
            summary: "Delete a pet",
            security: [{ basicAuth: [] }],
          },
          trace: {},
        },
        "/pets": {
          get: {
            operationId: "listPets",
            parameters: [{ name: "limit", in: "query" }],
          },
          post: {
            operationId: "createPet",
            security: [],
          },
        },
      },
    }

    const c = mapCollection(parseSpec(spec))

    expect(c.collection.id).toBe("pet-store-api")
    expect(c.collection.name).toBe("Pet Store API")

    const methods = reqs(c).map((r) => r.method)
    expect(methods).toEqual(["GET", "DELETE", "GET", "POST"])

    const getPet = reqs(c)[0]
    expect(getPet.id).toBe("get-pets-petid")
    expect(getPet.name).toBe("getPet")
    expect(getPet.method).toBe("GET")
    expect(getPet.url).toBe("https://$host/v1/pets/$petId")
    expect(getPet.params).toEqual({
      verbose: { value: "", enabled: true },
    })
    expect(getPet.headers).toEqual({
      "X-Trace": { value: "", enabled: true },
    })
    expect(getPet.body).toBeUndefined()
    expect(getPet.auth).toEqual({ type: "bearer", token: "$TOKEN" })

    const deletePet = reqs(c)[1]
    expect(deletePet.name).toBe("Delete a pet")
    expect(deletePet.method).toBe("DELETE")
    expect(deletePet.auth).toEqual({
      type: "basic",
      user: "$USER",
      pass: "$PASS",
    })

    const listPets = reqs(c)[2]
    expect(listPets.id).toBe("get-pets")
    expect(listPets.params).toEqual({
      limit: { value: "", enabled: true },
    })
    expect(listPets.auth).toEqual({ type: "bearer", token: "$TOKEN" })

    const createPet = reqs(c)[3]
    expect(createPet.id).toBe("post-pets")
    expect(createPet.auth).toEqual({ type: "none" })
  })

  it("accepts the integration spec as a YAML string", () => {
    const yamlText = `
openapi: "3.0.3"
info:
  title: YAML API!
paths:
  /x:
    get:
      operationId: getX
`
    const c = mapCollection(parseSpec(yamlText))
    expect(c.collection.id).toBe("yaml-api")
    expect(c.collection.name).toBe("YAML API!")
    expect(reqs(c)[0].id).toBe("get-x")
  })
})

describe("mapCollection — requestBody", () => {
  it("json with example", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/x": {
            post: {
              operationId: "postX",
              requestBody: {
                content: {
                  "application/json": {
                    schema: { example: { name: "Alice", age: 30 } },
                  },
                },
              },
            },
          },
        },
      }),
    )
    expect(reqs(c)[0].body).toBe('{"name":"Alice","age":30}')
    expect(reqs(c)[0].bodyType).toBe("json")
  })

  it("json with schema properties (no example)", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/x": {
            post: {
              operationId: "postX",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      properties: {
                        name: { type: "string" },
                        age: { type: "integer" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    )
    expect(reqs(c)[0].body).toBe('{"name":"$name","age":"$age"}')
    expect(reqs(c)[0].bodyType).toBe("json")
  })

  it("json with empty schema", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/x": {
            post: {
              operationId: "postX",
              requestBody: {
                content: {
                  "application/json": { schema: {} },
                },
              },
            },
          },
        },
      }),
    )
    expect(reqs(c)[0].body).toBe("{}")
    expect(reqs(c)[0].bodyType).toBe("json")
  })

  it("multipart with text and file fields (encoding marks file)", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/upload": {
            post: {
              operationId: "upload",
              requestBody: {
                content: {
                  "multipart/form-data": {
                    schema: {
                      properties: {
                        title: { type: "string" },
                        photo: { type: "string", format: "binary" },
                        doc: { type: "string", format: "binary" },
                      },
                    },
                    encoding: {
                      photo: { contentType: "image/png" },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    )
    expect(reqs(c)[0].bodyType).toBe("multipart")
    expect(reqs(c)[0].formData).toEqual([
      { name: "title", value: "", enabled: true, type: "text" },
      { name: "photo", value: "", enabled: true, type: "file" },
      { name: "doc", value: "", enabled: true, type: "file" },
    ])
  })

  it("multipart without encoding (all text)", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/x": {
            post: {
              operationId: "postX",
              requestBody: {
                content: {
                  "multipart/form-data": {
                    schema: {
                      properties: {
                        a: { type: "string" },
                        b: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    )
    expect(reqs(c)[0].bodyType).toBe("multipart")
    expect(reqs(c)[0].formData).toEqual([
      { name: "a", value: "", enabled: true, type: "text" },
      { name: "b", value: "", enabled: true, type: "text" },
    ])
  })

  it("multipart with no schema properties", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/x": {
            post: {
              operationId: "postX",
              requestBody: {
                content: {
                  "multipart/form-data": { schema: {} },
                },
              },
            },
          },
        },
      }),
    )
    expect(reqs(c)[0].bodyType).toBe("multipart")
    expect(reqs(c)[0].formData).toEqual([])
  })

  it("urlencoded", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/login": {
            post: {
              operationId: "login",
              requestBody: {
                content: {
                  "application/x-www-form-urlencoded": {
                    schema: {
                      properties: {
                        username: { type: "string" },
                        password: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    )
    expect(reqs(c)[0].bodyType).toBe("urlencoded")
    expect(reqs(c)[0].formData).toEqual([
      { name: "username", value: "$username", enabled: true, type: "text" },
      { name: "password", value: "$password", enabled: true, type: "text" },
    ])
  })

  it("no requestBody", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/x": { get: { operationId: "getX" } },
        },
      }),
    )
    expect(reqs(c)[0].body).toBeUndefined()
    expect(reqs(c)[0].bodyType).toBeUndefined()
    expect(reqs(c)[0].formData).toBeUndefined()
  })

  it("unsupported media type (text/plain)", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/x": {
            post: {
              operationId: "postX",
              requestBody: {
                content: {
                  "text/plain": { schema: { type: "string" } },
                },
              },
            },
          },
        },
      }),
    )
    expect(reqs(c)[0].body).toBeUndefined()
    expect(reqs(c)[0].bodyType).toBeUndefined()
  })

  it("requestBody without content", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/x": {
            post: {
              operationId: "postX",
              requestBody: { description: "no content" },
            },
          },
        },
      }),
    )
    expect(reqs(c)[0].body).toBeUndefined()
    expect(reqs(c)[0].bodyType).toBeUndefined()
  })

  it("non-mapping requestBody (string)", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/x": {
            post: {
              operationId: "postX",
              requestBody: "not a mapping",
            },
          },
        },
      }),
    )
    expect(reqs(c)[0].body).toBeUndefined()
    expect(reqs(c)[0].bodyType).toBeUndefined()
  })

  it("non-mapping content (array)", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/x": {
            post: {
              operationId: "postX",
              requestBody: { content: ["not a mapping"] },
            },
          },
        },
      }),
    )
    expect(reqs(c)[0].body).toBeUndefined()
    expect(reqs(c)[0].bodyType).toBeUndefined()
  })

  it("json takes priority over multipart when both present", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/x": {
            post: {
              operationId: "postX",
              requestBody: {
                content: {
                  "multipart/form-data": {
                    schema: { properties: { f: { type: "string" } } },
                  },
                  "application/json": { schema: { example: { a: 1 } } },
                },
              },
            },
          },
        },
      }),
    )
    expect(reqs(c)[0].bodyType).toBe("json")
    expect(reqs(c)[0].body).toBe('{"a":1}')
  })

  it("multipart takes priority over urlencoded when both present", () => {
    const c = mapCollection(
      makeNormalized({
        paths: {
          "/x": {
            post: {
              operationId: "postX",
              requestBody: {
                content: {
                  "application/x-www-form-urlencoded": {
                    schema: { properties: { x: { type: "string" } } },
                  },
                  "multipart/form-data": {
                    schema: { properties: { f: { type: "string" } } },
                  },
                },
              },
            },
          },
        },
      }),
    )
    expect(reqs(c)[0].bodyType).toBe("multipart")
  })
})

describe("mapCollection — folder grouping by tags", () => {
  it("groups requests by first tag into folders", () => {
    const n = makeNormalized({
      paths: {
        "/pets": {
          get: { operationId: "listPets", tags: ["pets"] },
          post: { operationId: "createPet", tags: ["pets"] },
        },
        "/users": {
          get: { operationId: "listUsers", tags: ["users"] },
        },
        "/health": {
          get: { operationId: "health" },
        },
      },
    })
    const c = mapCollection(n)
    const items = c.collection.items

    const folders = items.filter((i) => i.type === "folder")
    const rootReqs = items.filter((i) => i.type === "request")

    expect(folders).toHaveLength(2)
    expect(rootReqs).toHaveLength(1)
    expect(
      rootReqs[0].type === "request" && rootReqs[0].data.name,
    ).toBe("health")

    const petsFolder = folders.find(
      (f) => f.type === "folder" && f.data.name === "pets",
    )
    expect(petsFolder).toBeDefined()
    if (petsFolder && petsFolder.type === "folder") {
      expect(petsFolder.data.children).toHaveLength(2)
    }

    const usersFolder = folders.find(
      (f) => f.type === "folder" && f.data.name === "users",
    )
    expect(usersFolder).toBeDefined()
    if (usersFolder && usersFolder.type === "folder") {
      expect(usersFolder.data.children).toHaveLength(1)
    }

    const allReqs = reqs(c)
    expect(allReqs).toHaveLength(4)
  })

  it("first tag wins for multi-tagged request", () => {
    const n = makeNormalized({
      paths: {
        "/x": {
          get: { operationId: "getX", tags: ["alpha", "beta"] },
        },
      },
    })
    const c = mapCollection(n)
    const folders = c.collection.items.filter((i) => i.type === "folder")
    expect(folders).toHaveLength(1)
    expect(folders[0].type === "folder" && folders[0].data.name).toBe("alpha")
  })

  it("ignores non-string tags", () => {
    const n = makeNormalized({
      paths: {
        "/x": {
          get: { operationId: "getX", tags: [42, "valid"] },
        },
      },
    })
    const c = mapCollection(n)
    const folders = c.collection.items.filter((i) => i.type === "folder")
    expect(folders).toHaveLength(1)
    expect(folders[0].type === "folder" && folders[0].data.name).toBe("valid")
  })

  it("empty tags array — request at root", () => {
    const n = makeNormalized({
      paths: {
        "/x": { get: { operationId: "getX", tags: [] } },
      },
    })
    const c = mapCollection(n)
    expect(c.collection.items).toHaveLength(1)
    expect(c.collection.items[0].type).toBe("request")
  })

  it("all requests at root when no tags", () => {
    const n = makeNormalized({
      paths: {
        "/a": { get: { operationId: "getA" } },
        "/b": { post: { operationId: "postB" } },
      },
    })
    const c = mapCollection(n)
    expect(c.collection.items.every((i) => i.type === "request")).toBe(true)
  })

  it("slugifies folder id from tag name", () => {
    const n = makeNormalized({
      paths: {
        "/x": {
          get: { operationId: "getX", tags: ["Pet Store"] },
        },
      },
    })
    const c = mapCollection(n)
    const folder = c.collection.items.find((i) => i.type === "folder")
    expect(folder).toBeDefined()
    if (folder && folder.type === "folder") {
      expect(folder.data.id).toBe("pet-store")
      expect(folder.data.path).toBe("pet-store")
    }
  })

  it("folder requests have folder-prefixed ids", () => {
    const n = makeNormalized({
      paths: {
        "/users": {
          get: { operationId: "listUsers", tags: ["users"] },
        },
      },
    })
    const c = mapCollection(n)
    const folder = c.collection.items.find((i) => i.type === "folder")
    expect(folder).toBeDefined()
    if (folder && folder.type === "folder") {
      expect(folder.data.children[0].type).toBe("request")
      if (folder.data.children[0].type === "request") {
        expect(folder.data.children[0].data.id).toBe("users/get-users")
      }
    }
  })
})

describe("mapCollection — environments from servers", () => {
  it("creates one environment per server with vars", () => {
    const n = makeNormalized({
      servers: [
        { url: "https://{host}/v1", description: "Production" },
        { url: "https://{host}/v1", description: "Staging" },
      ],
      paths: { "/x": { get: { operationId: "getX" } } },
    })
    const c = mapCollection(n)
    expect(c.environments).toHaveLength(2)
    expect(c.environments[0].name).toBe("Production")
    expect(c.environments[1].name).toBe("Staging")
  })

  it("extracts URL template vars and uses variables.default", () => {
    const n = makeNormalized({
      servers: [
        {
          url: "https://{host}/v1",
          description: "Default",
          variables: { host: { default: "api.example.com" } },
        },
      ],
      paths: { "/x": { get: { operationId: "getX" } } },
    })
    const c = mapCollection(n)
    expect(c.environments).toHaveLength(1)
    expect(c.environments[0].vars).toEqual({ host: "api.example.com" })
  })

  it("uses empty string when URL var has no variable definition", () => {
    const n = makeNormalized({
      servers: [{ url: "https://{host}/v1" }],
      paths: { "/x": { get: { operationId: "getX" } } },
    })
    const c = mapCollection(n)
    expect(c.environments).toHaveLength(1)
    expect(c.environments[0].vars).toEqual({ host: "" })
  })

  it("name defaults to 'default' for single server without description", () => {
    const n = makeNormalized({
      servers: [{ url: "https://{host}/v1" }],
      paths: { "/x": { get: { operationId: "getX" } } },
    })
    const c = mapCollection(n)
    expect(c.environments).toHaveLength(1)
    expect(c.environments[0].name).toBe("default")
  })

  it("name uses 'server-N' for multiple servers without descriptions", () => {
    const n = makeNormalized({
      servers: [
        { url: "https://{host}/v1" },
        { url: "https://{host}/v1" },
      ],
      paths: { "/x": { get: { operationId: "getX" } } },
    })
    const c = mapCollection(n)
    expect(c.environments).toHaveLength(2)
    expect(c.environments[0].name).toBe("server-1")
    expect(c.environments[1].name).toBe("server-2")
  })

  it("empty environments when servers undefined", () => {
    const n = makeNormalized({
      servers: undefined,
      paths: { "/x": { get: { operationId: "getX" } } },
    })
    expect(mapCollection(n).environments).toEqual([])
  })

  it("empty environments when servers is empty array", () => {
    const n = makeNormalized({
      servers: [],
      paths: { "/x": { get: { operationId: "getX" } } },
    })
    expect(mapCollection(n).environments).toEqual([])
  })

  it("skips env when server URL has no template vars", () => {
    const n = makeNormalized({
      servers: [{ url: "https://api.example.com" }],
      paths: { "/x": { get: { operationId: "getX" } } },
    })
    expect(mapCollection(n).environments).toEqual([])
  })

  it("skips non-mapping server entries", () => {
    const n = makeNormalized({
      servers: [
        "garbage" as unknown as Record<string, unknown>,
        { url: "https://{host}/v1", description: "Good" },
      ],
      paths: { "/x": { get: { operationId: "getX" } } },
    })
    expect(mapCollection(n).environments).toHaveLength(1)
    expect(mapCollection(n).environments[0].name).toBe("Good")
  })
})
