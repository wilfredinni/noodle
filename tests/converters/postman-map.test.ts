import type { CollectionItem, Folder, Request } from "../../src/schema"
import { describe, it, expect } from "bun:test"
import { Collection as PmCollection } from "postman-collection"
import { mapCollection, convertTpl } from "../../src/converters/postman/map"
import { interpolatePathParams } from "../../src/requests/send"

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

  it("rejects dynamic Postman variables", () => {
    expect(() => convertTpl("{{$randomInt}}")).toThrow(
      'unsupported variable "{{$randomInt}}"',
    )
  })

  it("rejects hyphenated variable names", () => {
    expect(() => convertTpl("{{my-api-key}}")).toThrow(
      'unsupported variable "{{my-api-key}}"',
    )
  })

  it("rejects dotted variable names", () => {
    expect(() => convertTpl("{{user.id}}")).toThrow(
      'unsupported variable "{{user.id}}"',
    )
  })

  it("rejects empty variable names", () => {
    expect(() => convertTpl("{{}}")).toThrow('unsupported variable "{{}}"')
  })

  it("does not modify strings without templates", () => {
    expect(convertTpl("http://example.com/api")).toBe("http://example.com/api")
  })
})

describe("Postman NTLM import", () => {
  it("maps all NTLM credential fields", () => {
    const result = makeCollection({
      info: { name: "NTLM" },
      item: [
        {
          name: "Protected",
          request: {
            method: "GET",
            url: "http://example.com",
            header: [],
            auth: {
              type: "ntlm",
              ntlm: [
                { key: "username", value: "{{user}}", type: "string" },
                { key: "password", value: "{{pass}}", type: "string" },
                { key: "domain", value: "EXAMPLE", type: "string" },
                { key: "workstation", value: "NOODLE", type: "string" },
              ],
            },
          },
        },
      ],
    })
    expect((reqs(result)[0] as { auth: unknown }).auth).toEqual({
      type: "ntlm",
      username: "$user",
      password: "$pass",
      domain: "EXAMPLE",
      workstation: "NOODLE",
    })
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
    expect(r.params).toEqual([])
    expect(r.body).toBeUndefined()
    expect(r.bodyType).toBeUndefined()
    expect(r.auth).toEqual({ type: "inherit" })
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

  it("maps AWS Signature v4 auth", () => {
    const result = makeCollection({
      info: { name: "Auth" },
      item: [
        {
          name: "AWS Req",
          request: {
            method: "GET",
            url: "https://service.us-east-1.amazonaws.com",
            header: [],
            auth: {
              type: "awsv4",
              awsv4: [
                { key: "accessKey", value: "{{AWS_ACCESS_KEY_ID}}" },
                { key: "secretKey", value: "{{AWS_SECRET_ACCESS_KEY}}" },
                { key: "region", value: "us-east-1" },
                { key: "service", value: "execute-api" },
                { key: "sessionToken", value: "{{AWS_SESSION_TOKEN}}" },
              ],
            },
          },
        },
      ],
    })
    const r = reqs(result)[0] as Record<string, unknown>
    expect(r.auth).toEqual({
      type: "aws_sigv4",
      access_key: "$AWS_ACCESS_KEY_ID",
      secret_key: "$AWS_SECRET_ACCESS_KEY",
      region: "us-east-1",
      service: "execute-api",
      session_token: "$AWS_SESSION_TOKEN",
    })
  })

  it("maps standard API key fields and templates", () => {
    const result = makeCollection({
      info: { name: "Auth" },
      item: [
        {
          name: "API Key Req",
          request: {
            method: "GET",
            url: "http://example.com",
            header: [],
            auth: {
              type: "apikey",
              apikey: [
                { key: "key", value: "{{keyName}}", type: "string" },
                { key: "value", value: "{{apiValue}}", type: "string" },
                { key: "in", value: "query", type: "string" },
              ],
            },
          },
        },
      ],
    })
    const r = reqs(result)[0] as Record<string, unknown>
    expect(r.auth).toEqual({
      type: "api_key",
      key: "$keyName",
      value: "$apiValue",
      placement: "query",
    })
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

  it("maps OAuth 2 auth", () => {
    const result = makeCollection({
      info: { name: "Auth" },
      item: [
        {
          name: "OAuth Req",
          request: {
            method: "GET",
            url: "http://example.com",
            header: [],
            auth: {
              type: "oauth2",
              oauth2: [
                { key: "grant_type", value: "client_credentials" },
                {
                  key: "accessTokenUrl",
                  value: "https://identity.example/token",
                },
                { key: "clientId", value: "{{OAUTH_CLIENT_ID}}" },
                { key: "clientSecret", value: "{{OAUTH_CLIENT_SECRET}}" },
                { key: "scope", value: "read write" },
                { key: "addTokenTo", value: "queryParams" },
                { key: "headerPrefix", value: "Token" },
              ],
            },
          },
        },
      ],
    })
    const r = reqs(result)[0] as Record<string, unknown>
    expect(r.auth).toMatchObject({
      type: "oauth2",
      grant_type: "client_credentials",
      access_token_url: "https://identity.example/token",
      client_id: "$OAUTH_CLIENT_ID",
      client_secret: "$OAUTH_CLIENT_SECRET",
      scope: "read write",
      pkce: false,
      token_placement: "query",
      token_prefix: "Token",
    })
  })

  it("maps OAuth 1 auth", () => {
    const result = makeCollection({
      info: { name: "Auth" },
      item: [
        {
          name: "OAuth 1 Req",
          request: {
            method: "GET",
            url: "http://example.com",
            header: [],
            auth: {
              type: "oauth1",
              oauth1: [
                { key: "consumerKey", value: "{{CONSUMER_KEY}}" },
                { key: "consumerSecret", value: "{{CONSUMER_SECRET}}" },
                { key: "token", value: "{{ACCESS_TOKEN}}" },
                { key: "tokenSecret", value: "{{TOKEN_SECRET}}" },
                { key: "signatureMethod", value: "RSA-SHA256" },
                { key: "privateKey", value: "{{PRIVATE_KEY}}" },
                { key: "privateKeyType", value: "file" },
                { key: "placement", value: "query" },
                { key: "includeBodyHash", value: "true" },
              ],
            },
          },
        },
      ],
    })
    const request = reqs(result)[0] as Record<string, unknown>
    expect(request.auth).toMatchObject({
      type: "oauth1",
      consumer_key: "$CONSUMER_KEY",
      consumer_secret: "$CONSUMER_SECRET",
      access_token: "$ACCESS_TOKEN",
      access_token_secret: "$TOKEN_SECRET",
      signature_method: "RSA-SHA256",
      private_key: "$PRIVATE_KEY",
      private_key_type: "file",
      placement: "query",
      include_body_hash: true,
    })
  })

  it("maps boolean OAuth 1 parameters retained by the Postman SDK", () => {
    const result = makeCollection({
      info: { name: "Auth" },
      item: [
        {
          name: "OAuth 1 Req",
          request: {
            method: "GET",
            url: "http://example.com",
            auth: {
              type: "oauth1",
              oauth1: [
                { key: "addParamsToHeader", value: false, type: "boolean" },
                { key: "includeBodyHash", value: true, type: "boolean" },
              ],
            },
          },
        },
      ],
    })

    expect((reqs(result)[0] as Record<string, unknown>).auth).toMatchObject({
      type: "oauth1",
      placement: "query",
      include_body_hash: true,
    })
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

  it("maps raw XML body from its language and content type", () => {
    const result = makeCollection({
      info: { name: "XML" },
      item: [
        {
          name: "SOAP",
          request: {
            method: "POST",
            url: "http://example.com",
            header: [{ key: "Content-Type", value: "application/soap+xml" }],
            body: {
              mode: "raw",
              raw: "<Envelope><Value>{{value}}</Value></Envelope>",
              options: { raw: { language: "xml" } },
            },
          },
        },
      ],
    })
    const request = reqs(result)[0] as Request
    expect(request.bodyType).toBe("xml")
    expect(request.body).toBe("<Envelope><Value>$value</Value></Envelope>")
    expect(request.headers["Content-Type"]?.value).toBe("application/soap+xml")
  })

  it("maps raw XML from a content type without a language hint", () => {
    const result = makeCollection({
      info: { name: "XML" },
      item: [
        {
          name: "SOAP",
          request: {
            method: "POST",
            url: "http://example.com",
            header: [
              {
                key: "Content-Type",
                value: "application/soap+xml; charset=utf-8",
              },
            ],
            body: { mode: "raw", raw: "<Envelope />" },
          },
        },
      ],
    })

    expect((reqs(result)[0] as Request).bodyType).toBe("xml")
  })

  it("does not treat an XML-valued JSON media parameter as XML", () => {
    const result = makeCollection({
      info: { name: "JSON" },
      item: [
        {
          name: "JSON",
          request: {
            method: "POST",
            url: "http://example.com",
            header: [
              { key: "Content-Type", value: "application/json; profile=xml" },
            ],
            body: { mode: "raw", raw: '{"ok":true}' },
          },
        },
      ],
    })

    expect((reqs(result)[0] as Request).bodyType).toBe("json")
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

  it("preserves disabled fields and file references", () => {
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
                { key: "disabled", value: "no", disabled: true },
                { key: "avatar", src: "{{filePath}}", type: "file" },
              ],
            },
          },
        },
        {
          name: "Binary Req",
          request: {
            method: "POST",
            url: "http://example.com",
            header: [],
            body: { mode: "file", file: { src: "{{filePath}}" } },
          },
        },
      ],
    })
    const [multipart, binary] = reqs(result) as Record<string, unknown>[]
    expect(multipart.formData).toEqual([
      { name: "disabled", value: "no", enabled: false, type: "text" },
      { name: "avatar", value: "$filePath", enabled: true, type: "file" },
    ])
    expect(binary).toMatchObject({
      bodyType: "binary",
      filePath: "$filePath",
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

  it("reads redirect behavior from item metadata", () => {
    const result = makeCollection({
      info: { name: "Behavior" },
      item: [
        {
          name: "No Redirect",
          protocolProfileBehavior: {
            followRedirects: false,
            maxRedirects: 2,
          },
          request: { method: "GET", url: "http://example.com", header: [] },
        },
      ],
    })
    expect(reqs(result)[0]).toMatchObject({
      followRedirects: false,
      maxRedirects: 2,
    })
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

describe("mapCollection — path params", () => {
  it("extracts :id tokens from URL with url.variables", () => {
    const result = makeCollection({
      info: { name: "PathParams" },
      item: [
        {
          name: "Get User",
          request: {
            method: "GET",
            url: {
              raw: "https://api.example.com/users/:id",
              protocol: "https",
              host: ["api", "example", "com"],
              path: ["users", ":id"],
              query: [],
              variable: [{ key: "id", value: "{{userId}}" }],
            },
            header: [],
          },
        },
      ],
    })
    const r = reqs(result)[0] as Record<string, unknown>
    expect(r.url).toBe("https://api.example.com/users/:id")
    const pp = r.pathParams as
      | { name: string; value: string; enabled: boolean }[]
      | undefined
    expect(pp).toBeDefined()
    expect(pp).toHaveLength(1)
    expect(pp![0]).toEqual({ name: "id", value: "$userId", enabled: true })
  })

  it("extracts multiple :id tokens", () => {
    const result = makeCollection({
      info: { name: "MultiPathParams" },
      item: [
        {
          name: "Get Comment",
          request: {
            method: "GET",
            url: {
              raw: "https://api.example.com/posts/:postId/comments/:commentId",
              protocol: "https",
              host: ["api", "example", "com"],
              path: ["posts", ":postId", "comments", ":commentId"],
              query: [],
              variable: [
                { key: "postId", value: "42" },
                { key: "commentId", value: "99" },
              ],
            },
            header: [],
          },
        },
      ],
    })
    const r = reqs(result)[0] as Record<string, unknown>
    const pp = r.pathParams as
      | { name: string; value: string; enabled: boolean }[]
      | undefined
    expect(pp).toBeDefined()
    expect(pp).toHaveLength(2)
    expect(pp![0]).toEqual({ name: "postId", value: "42", enabled: true })
    expect(pp![1]).toEqual({ name: "commentId", value: "99", enabled: true })
    expect(r.url).toBe(
      "https://api.example.com/posts/:postId/comments/:commentId",
    )
    expect(interpolatePathParams(r.url as string, pp!)).toBe(
      "https://api.example.com/posts/42/comments/99",
    )
  })

  it("no pathParams when URL has no :id tokens", () => {
    const result = makeCollection({
      info: { name: "NoPathParams" },
      item: [
        {
          name: "List Users",
          request: {
            method: "GET",
            url: "https://api.example.com/users",
            header: [],
          },
        },
      ],
    })
    const r = reqs(result)[0] as Record<string, unknown>
    expect(r.pathParams).toBeUndefined()
  })

  it(":id without matching variable gets empty value", () => {
    const result = makeCollection({
      info: { name: "MissingVar" },
      item: [
        {
          name: "Get Item",
          request: {
            method: "GET",
            url: {
              raw: "https://api.example.com/items/:id",
              protocol: "https",
              host: ["api", "example", "com"],
              path: ["items", ":id"],
              query: [],
            },
            header: [],
          },
        },
      ],
    })
    const r = reqs(result)[0] as Record<string, unknown>
    const pp = r.pathParams as
      | { name: string; value: string; enabled: boolean }[]
      | undefined
    expect(pp).toBeDefined()
    expect(pp).toHaveLength(1)
    expect(pp![0]).toEqual({ name: "id", value: "", enabled: true })
  })

  it("preserves unsupported token names without creating a truncated path param", () => {
    const result = makeCollection({
      info: { name: "UnsupportedPathParam" },
      item: [
        {
          name: "Get Order",
          request: {
            method: "GET",
            url: {
              raw: "https://api.example.com/orders/:order~id",
              protocol: "https",
              host: ["api", "example", "com"],
              path: ["orders", ":order~id"],
              query: [],
              variable: [{ key: "order~id", value: "42" }],
            },
            header: [],
          },
        },
      ],
    })
    const r = reqs(result)[0] as Record<string, unknown>
    expect(r.url).toBe("https://api.example.com/orders/:order~id")
    expect(r.pathParams).toBeUndefined()
  })
})
