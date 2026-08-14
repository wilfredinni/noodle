import { describe, expect, it } from "bun:test"
import { exportOpenApi } from "../../src/converters/openapi"
import { defaultOAuth2Auth } from "../../src/auth/defaults"
import type { Collection, Request } from "../../src/schema"

type Operation = { requestBody?: unknown; servers?: unknown }

function request(overrides: Partial<Request> = {}): Request {
  return {
    id: "request",
    name: "Request",
    method: "GET",
    url: "https://api.example.com/request",
    timeout: 0,
    headers: {},
    params: [],
    auth: { type: "none" },
    bodyType: "none",
    ...overrides,
  }
}

function collection(items: Collection["items"]): Collection {
  return { id: "example", name: "Example API", items }
}

describe("exportOpenApi", () => {
  it("exports and combines all four OAuth 2 flows without credentials", () => {
    const grants = [
      "authorization_code",
      "client_credentials",
      "implicit",
      "password",
    ] as const
    const result = exportOpenApi(
      collection(
        grants.map((grant, index) => ({
          type: "request" as const,
          data: request({
            id: grant,
            url: `https://api.example.com/oauth-${index}`,
            auth: {
              ...defaultOAuth2Auth(),
              grant_type: grant,
              authorization_url: `https://identity.example/${grant}/authorize`,
              access_token_url: `https://identity.example/${grant}/token`,
              refresh_token_url: `https://identity.example/${grant}/refresh`,
              client_id: "must-not-export",
              client_secret: "must-not-export",
              scope: "read write",
            },
          }),
        })),
      ),
    )
    expect(result.document.components).toMatchObject({
      securitySchemes: {
        oauth2Auth: {
          type: "oauth2",
          flows: {
            authorizationCode: {
              authorizationUrl:
                "https://identity.example/authorization_code/authorize",
              tokenUrl: "https://identity.example/authorization_code/token",
              refreshUrl: "https://identity.example/authorization_code/refresh",
              scopes: { read: "", write: "" },
            },
            clientCredentials: {
              tokenUrl: "https://identity.example/client_credentials/token",
            },
            implicit: {
              authorizationUrl: "https://identity.example/implicit/authorize",
            },
            password: {
              tokenUrl: "https://identity.example/password/token",
            },
          },
        },
      },
    })
    expect(JSON.stringify(result.document)).not.toContain("must-not-export")
  })

  it("keeps incompatible OAuth 2 flows in separate security schemes", () => {
    const result = exportOpenApi(
      collection(
        ["one", "two"].map((provider) => ({
          type: "request" as const,
          data: request({
            id: provider,
            url: `https://api.example.com/${provider}`,
            auth: {
              ...defaultOAuth2Auth(),
              grant_type: "client_credentials",
              access_token_url: `https://identity.${provider}/token`,
              scope: provider,
            },
          }),
        })),
      ),
    )

    expect(result.document.components).toEqual({
      securitySchemes: {
        oauth2Auth: {
          type: "oauth2",
          flows: {
            clientCredentials: {
              tokenUrl: "https://identity.one/token",
              scopes: { one: "" },
            },
          },
        },
        oauth2Auth2: {
          type: "oauth2",
          flows: {
            clientCredentials: {
              tokenUrl: "https://identity.two/token",
              scopes: { two: "" },
            },
          },
        },
      },
    })
    expect(result.document.paths).toMatchObject({
      "/one": { get: { security: [{ oauth2Auth: ["one"] }] } },
      "/two": { get: { security: [{ oauth2Auth2: ["two"] }] } },
    })
  })

  it("exports resolved folder settings, enabled parameters, tags, and a server variable", () => {
    const result = exportOpenApi(
      collection([
        {
          type: "folder",
          data: {
            id: "users",
            name: "Users",
            path: "users",
            overrides: {
              headers: {
                "X-Folder": { value: "$FOLDER", enabled: true },
                "X-Disabled": { value: "hidden", enabled: false },
              },
              auth: { type: "bearer", token: "$TOKEN" },
            },
            children: [
              {
                type: "request",
                data: request({
                  id: "users/get-user",
                  name: "Get user",
                  url: "https://$host/v1/users/:id?source=inline",
                  params: [
                    { name: "source", value: "request", enabled: true },
                    { name: "limit", value: "$LIMIT", enabled: true },
                    { name: "skip", value: "no", enabled: false },
                  ],
                  pathParams: [
                    { name: "id", value: "$USER_ID", enabled: true },
                  ],
                  headers: {
                    "X-Request": { value: "request", enabled: true },
                    "Content-Type": {
                      value: "application/json",
                      enabled: true,
                    },
                  },
                  auth: { type: "inherit" },
                }),
              },
            ],
          },
        },
      ]),
    )

    expect(result.operationCount).toBe(1)
    expect(result.document).toMatchObject({
      openapi: "3.0.3",
      info: { title: "Example API", version: "1.0.0" },
      servers: [
        {
          url: "https://{host}",
          variables: { host: { default: "" } },
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer" },
        },
      },
    })
    expect(result.document.paths).toEqual({
      "/v1/users/{id}": {
        get: {
          operationId: "users/get-user",
          summary: "Get user",
          tags: ["Users"],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
              example: "$USER_ID",
            },
            {
              name: "source",
              in: "query",
              required: false,
              schema: { type: "string" },
              example: "request",
            },
            {
              name: "limit",
              in: "query",
              required: false,
              schema: { type: "string" },
              example: "$LIMIT",
            },
            {
              name: "X-Folder",
              in: "header",
              required: false,
              schema: { type: "string" },
              example: "$FOLDER",
            },
            {
              name: "X-Request",
              in: "header",
              required: false,
              schema: { type: "string" },
              example: "request",
            },
          ],
          security: [{ bearerAuth: [] }],
          responses: { default: { description: "Response" } },
        },
      },
    })
    expect(JSON.stringify(result.document)).not.toContain("$TOKEN")
  })

  it("exports JSON, urlencoded, multipart, and binary request bodies", () => {
    const result = exportOpenApi(
      collection([
        {
          type: "request",
          data: request({
            id: "json",
            method: "POST",
            url: "https://api.example.com/json",
            bodyType: "json",
            body: '{"id":"$ID"}',
          }),
        },
        {
          type: "request",
          data: request({
            id: "form",
            method: "POST",
            url: "https://api.example.com/form",
            bodyType: "urlencoded",
            formData: [
              { name: "enabled", value: "$VALUE", enabled: true, type: "text" },
              { name: "disabled", value: "no", enabled: false, type: "text" },
            ],
          }),
        },
        {
          type: "request",
          data: request({
            id: "multipart",
            method: "POST",
            url: "https://api.example.com/multipart",
            bodyType: "multipart",
            formData: [
              {
                name: "file",
                value: "/secret/file",
                enabled: true,
                type: "file",
              },
              { name: "title", value: "photo", enabled: true, type: "text" },
            ],
          }),
        },
        {
          type: "request",
          data: request({
            id: "binary",
            method: "PUT",
            url: "https://api.example.com/binary",
            bodyType: "binary",
            filePath: "/secret/file",
          }),
        },
      ]),
    )

    const paths = result.document.paths as Record<
      string,
      Record<string, Operation>
    >
    expect(paths["/json"].post.requestBody).toEqual({
      content: { "application/json": { example: { id: "$ID" } } },
    })
    expect(paths["/form"].post.requestBody).toEqual({
      content: {
        "application/x-www-form-urlencoded": {
          schema: {
            type: "object",
            properties: {
              enabled: { type: "string", example: "$VALUE" },
            },
          },
        },
      },
    })
    expect(paths["/multipart"].post.requestBody).toEqual({
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            properties: {
              file: { type: "string", format: "binary" },
              title: { type: "string", example: "photo" },
            },
          },
        },
      },
    })
    expect(paths["/binary"].put.requestBody).toEqual({
      content: {
        "application/octet-stream": {
          schema: { type: "string", format: "binary" },
        },
      },
    })
  })

  it("uses operation servers for mixed origins and no server for relative URLs", () => {
    const result = exportOpenApi(
      collection([
        {
          type: "request",
          data: request({ id: "one", url: "https://one.example/a" }),
        },
        {
          type: "request",
          data: request({ id: "two", url: "https://two.example/b" }),
        },
        { type: "request", data: request({ id: "local", url: "/health" }) },
      ]),
    )

    expect(result.document.servers).toBeUndefined()
    const paths = result.document.paths as Record<
      string,
      Record<string, Operation>
    >
    expect(paths["/a"].get.servers).toEqual([{ url: "https://one.example" }])
    expect(paths["/b"].get.servers).toEqual([{ url: "https://two.example" }])
    expect(paths["/health"].get.servers).toBeUndefined()
  })

  it("uses supplied environment servers for base_url requests", () => {
    const result = exportOpenApi(
      collection([
        {
          type: "request",
          data: request({ id: "base", url: "$base_url/health" }),
        },
        {
          type: "request",
          data: request({ id: "literal", url: "https://api.example/literal" }),
        },
        {
          type: "request",
          data: request({
            id: "external",
            url: "https://other.example/status",
          }),
        },
      ]),
      {
        servers: [
          { url: "https://api.example", description: "production" },
          { url: "https://api.example", description: "staging" },
        ],
      },
    )

    expect(result.document.servers).toEqual([
      { url: "https://api.example", description: "production" },
      { url: "https://api.example", description: "staging" },
    ])
    const paths = result.document.paths as Record<
      string,
      Record<string, Operation>
    >
    expect(paths["/health"].get.servers).toBeUndefined()
    expect(paths["/literal"].get.servers).toBeUndefined()
    expect(paths["/status"].get.servers).toEqual([
      { url: "https://other.example" },
    ])
  })

  it("exports variables in URL schemes and ports", () => {
    const result = exportOpenApi(
      collection([
        {
          type: "request",
          data: request({
            url: "$SCHEME://$HOST:$PORT/v1/$VERSION?region=$REGION",
          }),
        },
      ]),
    )

    expect(result.document).toMatchObject({
      servers: [
        {
          url: "{SCHEME}://{HOST}:{PORT}",
          variables: {
            SCHEME: { default: "" },
            HOST: { default: "" },
            PORT: { default: "" },
          },
        },
      ],
      paths: {
        "/v1/$VERSION": {
          get: {
            parameters: [
              {
                name: "region",
                in: "query",
                required: false,
                schema: { type: "string" },
                example: "$REGION",
              },
            ],
          },
        },
      },
    })
  })

  it("preserves repeated query values and filters protected headers", () => {
    const result = exportOpenApi(
      collection([
        {
          type: "request",
          data: request({
            url: "https://api.example.com/search?source=stale&tag=url-one&tag=url-two",
            params: [
              { name: "source", value: "first", enabled: true },
              { name: "source", value: "second", enabled: true },
            ],
            headers: {
              Authorization: { value: "Bearer super-secret", enabled: true },
              aCcEpT: { value: "application/json", enabled: true },
              "Content-Type": { value: "application/json", enabled: true },
              "X-Request": { value: "kept", enabled: true },
            },
          }),
        },
      ]),
    )

    const parameters = (
      result.document.paths as Record<
        string,
        Record<string, { parameters: Record<string, unknown>[] }>
      >
    )["/search"].get.parameters
    expect(parameters).toEqual([
      {
        name: "tag",
        in: "query",
        required: false,
        style: "form",
        explode: true,
        schema: { type: "array", items: { type: "string" } },
        example: ["url-one", "url-two"],
      },
      {
        name: "source",
        in: "query",
        required: false,
        style: "form",
        explode: true,
        schema: { type: "array", items: { type: "string" } },
        example: ["first", "second"],
      },
      {
        name: "X-Request",
        in: "header",
        required: false,
        schema: { type: "string" },
        example: "kept",
      },
    ])
    expect(JSON.stringify(result.document)).not.toContain("super-secret")
  })

  it("preserves exact JSON number literals", () => {
    const result = exportOpenApi(
      collection([
        {
          type: "request",
          data: request({
            method: "POST",
            bodyType: "json",
            body: '{"integer":9007199254740993,"decimal":0.12345678901234567890}',
          }),
        },
      ]),
    )

    expect(JSON.stringify(result.document)).toContain("9007199254740993")
    expect(JSON.stringify(result.document)).toContain("0.12345678901234567890")
  })

  it("exports basic and API-key security without credentials", () => {
    const result = exportOpenApi(
      collection([
        {
          type: "request",
          data: request({
            id: "basic",
            url: "https://api.example/basic",
            auth: { type: "basic", user: "user", pass: "super-secret" },
          }),
        },
        {
          type: "request",
          data: request({
            id: "key",
            url: "https://api.example/key",
            auth: {
              type: "api_key",
              key: "X-API-Key",
              value: "super-secret",
              placement: "header",
            },
          }),
        },
      ]),
    )

    expect(result.document.components).toEqual({
      securitySchemes: {
        basicAuth: { type: "http", scheme: "basic" },
        apiKeyHeaderXAPIKey: {
          type: "apiKey",
          name: "X-API-Key",
          in: "header",
        },
      },
    })
    expect(JSON.stringify(result.document)).not.toContain("super-secret")
  })

  it("exports AWS Signature v4 security without credentials", () => {
    const result = exportOpenApi(
      collection([
        {
          type: "request",
          data: request({
            auth: {
              type: "aws_sigv4",
              access_key: "AKID",
              secret_key: "super-secret",
              region: "us-east-1",
              service: "execute-api",
            },
          }),
        },
      ]),
    )

    expect(result.document.components).toEqual({
      securitySchemes: {
        awsSigV4: { type: "http", scheme: "AWS4-HMAC-SHA256" },
      },
    })
    expect(JSON.stringify(result.document)).not.toContain("super-secret")
  })

  it("exports NTLM as an HTTP security marker without credentials", () => {
    const result = exportOpenApi(
      collection([
        {
          type: "request",
          data: request({
            auth: {
              type: "ntlm",
              username: "alice",
              password: "super-secret",
              domain: "EXAMPLE",
              workstation: "NOODLE",
            },
          }),
        },
      ]),
    )
    expect(result.document.components).toEqual({
      securitySchemes: {
        ntlmAuth: { type: "http", scheme: "ntlm" },
      },
    })
    expect(JSON.stringify(result.document)).not.toContain("super-secret")
  })

  it("does not merge API-key schemes whose sanitized names collide", () => {
    const result = exportOpenApi(
      collection([
        {
          type: "request",
          data: request({
            id: "first",
            url: "https://api.example/first",
            auth: {
              type: "api_key",
              key: "X API Key",
              value: "$FIRST",
              placement: "header",
            },
          }),
        },
        {
          type: "request",
          data: request({
            id: "second",
            url: "https://api.example/second",
            auth: {
              type: "api_key",
              key: "X-API-Key",
              value: "$SECOND",
              placement: "header",
            },
          }),
        },
      ]),
    )

    expect(result.document.components).toEqual({
      securitySchemes: {
        apiKeyHeaderXAPIKey: {
          type: "apiKey",
          name: "X API Key",
          in: "header",
        },
        apiKeyHeaderXAPIKey2: {
          type: "apiKey",
          name: "X-API-Key",
          in: "header",
        },
      },
    })
  })

  it("exports an empty collection and rejects invalid JSON and duplicate operations", () => {
    expect(exportOpenApi(collection([]))).toMatchObject({
      operationCount: 0,
      document: { paths: {} },
    })
    expect(() =>
      exportOpenApi(
        collection([
          {
            type: "request",
            data: request({ bodyType: "json", body: "{not json}" }),
          },
        ]),
      ),
    ).toThrow(
      'converters.openapi.export: invalid JSON body for request "request"',
    )
    expect(() =>
      exportOpenApi(
        collection([
          {
            type: "request",
            data: request({ id: "one", url: "https://one.example/x" }),
          },
          {
            type: "request",
            data: request({ id: "two", url: "https://two.example/x" }),
          },
        ]),
      ),
    ).toThrow('converters.openapi.export: duplicate operation "get /x"')
  })
})
