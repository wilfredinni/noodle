import type { CollectionItem, Folder } from "../../src/schema"
import { describe, it, expect } from "bun:test"
import { Collection as PmCollection } from "postman-collection"
import { mapCollection, convertTpl } from "../../src/converters/postman/map"

function reqs(result: ReturnType<typeof mapCollection>): unknown[] {
  function flatten(items: CollectionItem[]): unknown[] {
    const out: unknown[] = []
    for (const item of items) {
      if (item.type === "request") {
        out.push(item.data)
      } else if (item.type === "folder") {
        out.push(...flatten((item.data as Folder).children))
      }
    }
    return out
  }
  return flatten(result.collection.items)
}

function makeCollection(json: Record<string, unknown>) {
  const col = new PmCollection(json)
  return mapCollection(col)
}

describe("convertTpl", () => {
  it("converts {{var}} to $var", () => {
    expect(convertTpl("{{baseUrl}}/api")).toBe("$baseUrl/api")
  })

  it("converts multiple templates", () => {
    expect(convertTpl("{{host}}:{{port}}")).toBe("$host:$port")
  })

  it("preserves dynamic Postman vars", () => {
    expect(convertTpl("{{$randomInt}}")).toBe("$$randomInt")
  })

  it("converts hyphenated variable names", () => {
    expect(convertTpl("{{my-api-key}}")).toBe("$my-api-key")
  })

  it("converts dotted variable names", () => {
    expect(convertTpl("{{user.id}}")).toBe("$user.id")
  })

  it("does not modify strings without templates", () => {
    expect(convertTpl("http://example.com/api")).toBe("http://example.com/api")
  })
})

describe("mapCollection — flat collection, single request", () => {
  it("maps a minimal GET request with no body or auth", () => {
    const result = makeCollection({
      info: { name: "Minimal" },
      item: [
        {
          name: "Get Hello",
          request: {
            method: "GET",
            url: "http://example.com/hello",
            header: [],
          },
        },
      ],
    })
    const all = reqs(result)
    expect(all.length).toBe(1)
    const r = all[0] as Record<string, unknown>
    expect(r.name).toBe("Get Hello")
    expect(r.method).toBe("GET")
    expect(r.url).toBe("http://example.com/hello")
    expect(r.timeout).toBe(0)
    expect(r.headers).toEqual({})
    expect(r.params).toEqual({})
    expect(r.body).toBeUndefined()
    expect(r.bodyType).toBeUndefined()
    expect(r.auth).toEqual({ type: "none" })
  })
})

describe("mapCollection — auth variants", () => {
  it("maps bearer auth", () => {
    const result = makeCollection({
      info: { name: "Auth" },
      item: [
        {
          name: "Bearer Req",
          request: {
            method: "GET",
            url: "http://example.com",
            header: [],
            auth: {
              type: "bearer",
              bearer: [{ key: "token", value: "{{apiKey}}", type: "string" }],
            },
          },
        },
      ],
    })
    const r = reqs(result)[0] as Record<string, unknown>
    expect(r.auth).toEqual({ type: "bearer", token: "$apiKey" })
  })

  it("maps basic auth", () => {
    const result = makeCollection({
      info: { name: "Auth" },
      item: [
        {
          name: "Basic Req",
          request: {
            method: "GET",
            url: "http://example.com",
            header: [],
            auth: {
              type: "basic",
              basic: [
                { key: "username", value: "admin", type: "string" },
                { key: "password", value: "pass", type: "string" },
              ],
            },
          },
        },
      ],
    })
    const r = reqs(result)[0] as Record<string, unknown>
    expect(r.auth).toEqual({ type: "basic", user: "admin", pass: "pass" })
  })

  it("maps noauth to none", () => {
    const result = makeCollection({
      info: { name: "Auth" },
      item: [
        {
          name: "NoAuth Req",
          request: {
            method: "GET",
            url: "http://example.com",
            header: [],
            auth: { type: "noauth" },
          },
        },
      ],
    })
    const r = reqs(result)[0] as Record<string, unknown>
    expect(r.auth).toEqual({ type: "none" })
  })

  it("maps inherit auth", () => {
    const result = makeCollection({
      info: { name: "Auth" },
      item: [
        {
          name: "Inherit Req",
          request: {
            method: "GET",
            url: "http://example.com",
            header: [],
            auth: { type: "inherit" },
          },
        },
      ],
    })
    const r = reqs(result)[0] as Record<string, unknown>
    expect(r.auth).toEqual({ type: "inherit" })
  })

  it("maps unsupported auth (oauth2) to none", () => {
    const result = makeCollection({
      info: { name: "Auth" },
      item: [
        {
          name: "OAuth Req",
          request: {
            method: "GET",
            url: "http://example.com",
            header: [],
            auth: { type: "oauth2" },
          },
        },
      ],
    })
    const r = reqs(result)[0] as Record<string, unknown>
    expect(r.auth).toEqual({ type: "none" })
  })
})

describe("mapCollection — body variants", () => {
  it("maps raw JSON body", () => {
    const result = makeCollection({
      info: { name: "Body" },
      item: [
        {
          name: "JSON Req",
          request: {
            method: "POST",
            url: "http://example.com",
            header: [],
            body: {
              mode: "raw",
              raw: '{"key":"value"}',
              options: { raw: { language: "json" } },
            },
          },
        },
      ],
    })
    const r = reqs(result)[0] as Record<string, unknown>
    expect(r.body).toBe('{"key":"value"}')
    expect(r.bodyType).toBe("json")
  })

  it("maps urlencoded body", () => {
    const result = makeCollection({
      info: { name: "Body" },
      item: [
        {
          name: "Form Req",
          request: {
            method: "POST",
            url: "http://example.com",
            header: [],
            body: {
              mode: "urlencoded",
              urlencoded: [
                { key: "email", value: "test@test.com", type: "text" },
              ],
            },
          },
        },
      ],
    })
    const r = reqs(result)[0] as Record<string, unknown>
    expect(r.bodyType).toBe("urlencoded")
    const fd = r.formData as { name: string; value: string; type: string }[]
    expect(fd).toBeDefined()
    expect(fd.length).toBe(1)
    expect(fd[0].name).toBe("email")
    expect(fd[0].value).toBe("test@test.com")
  })

  it("maps formdata body with text and file fields", () => {
    const result = makeCollection({
      info: { name: "Body" },
      item: [
        {
          name: "Multipart Req",
          request: {
            method: "POST",
            url: "http://example.com",
            header: [],
            body: {
              mode: "formdata",
              formdata: [
                { key: "name", value: "John", type: "text" },
                { key: "avatar", value: "", type: "file" },
              ],
            },
          },
        },
      ],
    })
    const r = reqs(result)[0] as Record<string, unknown>
    expect(r.bodyType).toBe("multipart")
    const fd = r.formData as {
      name: string
      value: string
      type: string
      enabled: boolean
    }[]
    expect(fd).toBeDefined()
    expect(fd.length).toBe(2)
    expect(fd[0]).toEqual({
      name: "name",
      value: "John",
      enabled: true,
      type: "text",
    })
    expect(fd[1]).toEqual({
      name: "avatar",
      value: "",
      enabled: true,
      type: "file",
    })
  })
})

describe("mapCollection — disabled headers and params", () => {
  it("maps disabled headers with enabled: false", () => {
    const result = makeCollection({
      info: { name: "Headers" },
      item: [
        {
          name: "Disabled Header Req",
          request: {
            method: "GET",
            url: "http://example.com",
            header: [
              { key: "X-Enabled", value: "yes" },
              { key: "X-Disabled", value: "no", disabled: true },
            ],
          },
        },
      ],
    })
    const r = reqs(result)[0] as Record<string, unknown>
    const headers = r.headers as Record<
      string,
      { value: string; enabled: boolean }
    >
    expect(headers["X-Enabled"]).toEqual({ value: "yes", enabled: true })
    expect(headers["X-Disabled"]).toEqual({ value: "no", enabled: false })
  })
})

describe("mapCollection — nesting", () => {
  it("maps nested folders recursively", () => {
    const result = makeCollection({
      info: { name: "Nested" },
      item: [
        {
          name: "Folder1",
          item: [
            {
              name: "NestedReq",
              request: {
                method: "GET",
                url: "http://example.com/nested",
                header: [],
              },
            },
          ],
        },
      ],
    })
    const all = reqs(result)
    expect(all.length).toBe(1)
    const r = all[0] as Record<string, unknown>
    expect(r.name).toBe("NestedReq")
  })

  it("produces folder in collection items", () => {
    const result = makeCollection({
      info: { name: "Foldered" },
      item: [
        {
          name: "MyFolder",
          item: [
            {
              name: "InnerReq",
              request: {
                method: "GET",
                url: "http://example.com",
                header: [],
              },
            },
          ],
        },
      ],
    })
    const folders = result.collection.items.filter((i) => i.type === "folder")
    expect(folders.length).toBe(1)
    expect(folders[0].data.name).toBe("MyFolder")
  })
})

describe("mapCollection — collection variables", () => {
  it("maps collection variables to a default environment", () => {
    const result = makeCollection({
      info: { name: "Env" },
      item: [],
      variable: [
        { key: "baseUrl", value: "https://api.example.com" },
        { key: "token", value: "" },
      ],
    })
    expect(result.environments.length).toBe(1)
    expect(result.environments[0].name).toBe("default")
    expect(result.environments[0].vars).toEqual({
      baseUrl: "https://api.example.com",
      token: "",
    })
  })

  it("returns empty environments when no collection variables", () => {
    const result = makeCollection({
      info: { name: "NoEnv" },
      item: [],
    })
    expect(result.environments.length).toBe(0)
  })
})

describe("mapCollection — edge cases", () => {
  it("generates unique IDs for requests with the same name", () => {
    const result = makeCollection({
      info: { name: "Dedup" },
      item: [
        {
          name: "Users",
          request: {
            method: "GET",
            url: "http://example.com/users",
            header: [],
          },
        },
        {
          name: "Users",
          request: {
            method: "GET",
            url: "http://example.com/users/2",
            header: [],
          },
        },
      ],
    })
    const all = reqs(result) as Record<string, unknown>[]
    expect(all.length).toBe(2)
    const ids = all.map((r) => r.id)
    expect(ids[0]).toBe("get-users")
    expect(ids[1]).toBe("get-users-2")
  })

  it("generates unique IDs for folders with the same name", () => {
    const result = makeCollection({
      info: { name: "DedupFolders" },
      item: [
        {
          name: "v1",
          item: [
            {
              name: "Ping",
              request: {
                method: "GET",
                url: "http://example.com/ping",
                header: [],
              },
            },
          ],
        },
        {
          name: "v1",
          item: [
            {
              name: "Pong",
              request: {
                method: "GET",
                url: "http://example.com/pong",
                header: [],
              },
            },
          ],
        },
      ],
    })
    const folders = result.collection.items.filter((i) => i.type === "folder")
    expect(folders.length).toBe(2)
    expect((folders[0].data as { id: string }).id).toBe("v1")
    expect((folders[1].data as { id: string }).id).toBe("v1-2")
  })

  it("falls back to $base_url when request has no URL", () => {
    const result = makeCollection({
      info: { name: "NoUrl" },
      item: [
        {
          name: "No URL Req",
          request: { method: "GET", header: [] },
        },
      ],
    })
    const r = reqs(result)[0] as Record<string, unknown>
    expect(r.url).toBe("$base_url")
  })

  it("falls back to $base_url when request url is undefined", () => {
    const result = makeCollection({
      info: { name: "NoUrl2" },
      item: [
        {
          name: "Missing Url",
          request: { method: "POST" },
        },
      ],
    })
    const r = reqs(result)[0] as Record<string, unknown>
    expect(r.url).toBe("$base_url")
  })

  it("maps folder-level auth override", () => {
    const result = makeCollection({
      info: { name: "FolderAuth" },
      item: [
        {
          name: "Protected",
          auth: {
            type: "bearer",
            bearer: [
              { key: "token", value: "{{folderToken}}", type: "string" },
            ],
          },
          item: [
            {
              name: "Inner",
              request: { method: "GET", url: "http://example.com", header: [] },
            },
          ],
        },
      ],
    })
    const folders = result.collection.items.filter((i) => i.type === "folder")
    expect(folders.length).toBe(1)
    const overrides = (folders[0].data as { overrides?: { auth?: unknown } })
      .overrides
    expect(overrides).toBeDefined()
    expect(overrides!.auth).toEqual({ type: "bearer", token: "$folderToken" })
  })

  it("ignores unknown body mode (graphql)", () => {
    const result = makeCollection({
      info: { name: "UnknownBody" },
      item: [
        {
          name: "GraphQL Req",
          request: {
            method: "POST",
            url: "http://example.com/graphql",
            header: [],
            body: {
              mode: "graphql",
              graphql: { query: "query { users }" },
            },
          },
        },
      ],
    })
    const r = reqs(result)[0] as Record<string, unknown>
    expect(r.body).toBeUndefined()
    expect(r.bodyType).toBeUndefined()
  })
})
