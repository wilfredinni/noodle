import { describe, it, expect } from "bun:test"
import { parseSpec, mapCollection, internals } from "../src/converters/openapi"
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

describe("mapCollection URL helpers (internals — temporary)", () => {
  it("urlTemplateToVar replaces {name} with {{name}}", () => {
    expect(internals.urlTemplateToVar("/users/{id}")).toBe("/users/{{id}}")
    expect(internals.urlTemplateToVar("https://{host}/v1/{path}")).toBe(
      "https://{{host}}/v1/{{path}}",
    )
  })

  it("urlTemplateToVar leaves strings without braces alone", () => {
    expect(internals.urlTemplateToVar("https://example.com/v1")).toBe(
      "https://example.com/v1",
    )
  })

  it("baseUrl returns first server url (template-substituted)", () => {
    const n = makeNormalized({ servers: [{ url: "https://{host}/v1" }] })
    expect(internals.baseUrl(n)).toBe("https://{{host}}/v1")
  })

  it("baseUrl returns / when servers is missing", () => {
    const n = makeNormalized({ servers: undefined })
    expect(internals.baseUrl(n)).toBe("/")
  })

  it("baseUrl returns / when servers is an empty array", () => {
    const n = makeNormalized({ servers: [] })
    expect(internals.baseUrl(n)).toBe("/")
  })

  it("baseUrl returns / when servers[0].url is empty string", () => {
    const n = makeNormalized({ servers: [{ url: "" }] })
    expect(internals.baseUrl(n)).toBe("/")
  })

  it("baseUrl returns / when servers[0].url is not a string", () => {
    const n = makeNormalized({ servers: [{ url: 123 }] })
    expect(internals.baseUrl(n)).toBe("/")
  })

  it("baseUrl returns / when servers[0] is not an object", () => {
    const n = makeNormalized({ servers: ["https://x.com"] })
    expect(internals.baseUrl(n)).toBe("/")
  })

  it("joinUrl merges base and path without doubling slashes", () => {
    expect(internals.joinUrl("https://x.com/v1", "/users")).toBe(
      "https://x.com/v1/users",
    )
    expect(internals.joinUrl("https://x.com/v1/", "/users")).toBe(
      "https://x.com/v1/users",
    )
    expect(internals.joinUrl("/", "/users")).toBe("/users")
    expect(internals.joinUrl("/", "/users/{{id}}")).toBe("/users/{{id}}")
  })

  it("joinUrl prepends / when path doesn't start with one", () => {
    expect(internals.joinUrl("https://x.com", "users")).toBe(
      "https://x.com/users",
    )
  })
})
