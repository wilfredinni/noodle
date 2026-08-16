import { describe, expect, it } from "bun:test"
import { insomniaImporter } from "../src/converters/insomnia"
import type { CollectionItem, Request } from "../src/schema"

function requests(items: CollectionItem[]): Request[] {
  return items.flatMap((item) =>
    item.type === "request" ? [item.data] : requests(item.data.children),
  )
}

function exportJson(resources: unknown[]): string {
  return JSON.stringify({ _type: "export", __export_format: 4, resources })
}

describe("insomniaImporter", () => {
  it("maps folders, HTTP requests, variables, bodies, auth, and environments", () => {
    const result = insomniaImporter.import(
      exportJson([
        {
          _id: "req_nested",
          _type: "request",
          parentId: "fld_nested",
          name: "Create Widget",
          method: "POST",
          url: "https://{{ _.host }}/widgets/:id",
          headers: [{ name: "X-Token", value: "{{ token }}" }],
          parameters: [
            { name: "page", value: "2" },
            { name: "hidden", value: "x", disabled: true },
          ],
          pathParameters: [{ name: "id", value: "widget-1" }],
          body: { mimeType: "application/json", text: '{"name":"{{ name }}"}' },
          authentication: {
            type: "apikey",
            key: "X-Key",
            value: "{{ key }}",
            addTo: "header",
          },
          settingFollowRedirects: "never",
        },
        {
          _id: "fld_nested",
          _type: "folder",
          parentId: "fld_root",
          name: "Nested",
        },
        {
          _id: "env_dev",
          _type: "environment",
          parentId: "env_base",
          name: "Development",
          data: { host: "api.example.com", config: { retries: 2 } },
        },
        { _id: "wrk", _type: "workspace", parentId: null, name: "Example API" },
        {
          _id: "fld_root",
          _type: "request_group",
          parentId: "wrk",
          name: "Widgets",
        },
        {
          _id: "env_base",
          _type: "environment",
          parentId: "wrk",
          name: "Base Environment",
          data: { token: "{{ secret }}", host: "base.example.com" },
        },
        {
          _id: "grpc",
          _type: "grpc_request",
          parentId: "wrk",
          name: "Ignored",
        },
      ]),
    )

    expect(result.collection).toMatchObject({
      id: "example-api",
      name: "Example API",
    })
    const root = result.collection.items[0]!
    expect(root.type).toBe("folder")
    if (root.type !== "folder") throw new Error("expected folder")
    expect(root.data.path).toBe("widgets")
    const nested = root.data.children[0]!
    expect(nested.type).toBe("folder")
    if (nested.type !== "folder") throw new Error("expected nested folder")
    expect(nested.data.path).toBe("widgets/nested")

    const request = requests(result.collection.items)[0]!
    expect(request).toMatchObject({
      id: "widgets/nested/post-create-widget",
      url: "https://$host/widgets/:id",
      bodyType: "json",
      body: '{"name":"$name"}',
      followRedirects: false,
      auth: {
        type: "api_key",
        key: "X-Key",
        value: "$key",
        placement: "header",
      },
    })
    expect(request.headers).toEqual({
      "X-Token": { value: "$token", enabled: true },
    })
    expect(request.params).toEqual([
      { name: "page", value: "2", enabled: true },
      { name: "hidden", value: "x", enabled: false },
    ])
    expect(request.pathParams).toEqual([
      { name: "id", value: "widget-1", enabled: true },
    ])
    expect(result.environments).toEqual([
      {
        name: "Development",
        vars: {
          token: "$secret",
          host: "api.example.com",
          config: '{"retries":2}',
        },
      },
      {
        name: "Base Environment",
        vars: { token: "$secret", host: "base.example.com" },
      },
    ])
  })

  it("maps form and binary bodies plus compatible authentication", () => {
    const result = insomniaImporter.import(
      exportJson([
        { _id: "wrk", _type: "workspace", name: "Bodies" },
        {
          _id: "basic",
          _type: "request",
          parentId: "wrk",
          name: "Basic",
          method: "PUT",
          url: "https://x",
          body: {
            mimeType: "application/x-www-form-urlencoded",
            params: [{ name: "q", value: "{{ q }}" }],
          },
          authentication: {
            type: "basic",
            username: "{{ user }}",
            password: "pass",
          },
        },
        {
          _id: "file",
          _type: "request",
          parentId: "wrk",
          name: "File",
          method: "POST",
          url: "https://x",
          body: {
            mimeType: "multipart/form-data",
            params: [{ name: "upload", fileName: "{{ file }}", type: "file" }],
          },
          authentication: { type: "oauth2" },
        },
        {
          _id: "binary",
          _type: "request",
          parentId: "wrk",
          name: "Binary",
          method: "POST",
          url: "https://x",
          body: { fileName: "./payload.bin" },
        },
      ]),
    )
    const [basic, file, binary] = requests(result.collection.items)
    expect(basic).toMatchObject({
      bodyType: "urlencoded",
      formData: [{ name: "q", value: "$q", enabled: true, type: "text" }],
      auth: { type: "basic", user: "$user", pass: "pass" },
    })
    expect(file).toMatchObject({
      bodyType: "multipart",
      formData: [
        { name: "upload", value: "$file", enabled: true, type: "file" },
      ],
      auth: { type: "oauth2", grant_type: "authorization_code" },
    })
    expect(binary).toMatchObject({
      bodyType: "binary",
      filePath: "./payload.bin",
    })
  })

  it("maps XML bodies and preserves their MIME header", () => {
    const result = insomniaImporter.import(
      exportJson([
        { _id: "wrk", _type: "workspace", name: "XML" },
        {
          _id: "xml",
          _type: "request",
          parentId: "wrk",
          name: "SOAP",
          method: "POST",
          url: "https://x",
          headers: [{ name: "Content-Type", value: "application/soap+xml" }],
          body: {
            mimeType: "application/soap+xml; charset=utf-8",
            text: "<Envelope><Value>{{ value }}</Value></Envelope>",
          },
        },
      ]),
    )
    expect(requests(result.collection.items)[0]).toMatchObject({
      bodyType: "xml",
      body: "<Envelope><Value>$value</Value></Envelope>",
      headers: {
        "Content-Type": { value: "application/soap+xml", enabled: true },
      },
    })
  })

  it("maps NTLM authentication", () => {
    const result = insomniaImporter.import(
      exportJson([
        { _id: "wrk", _type: "workspace", name: "NTLM" },
        {
          _id: "ntlm",
          _type: "request",
          parentId: "wrk",
          name: "NTLM",
          method: "GET",
          url: "https://x",
          authentication: {
            type: "ntlm",
            username: "{{ user }}",
            password: "{{ password }}",
            domain: "EXAMPLE",
            workstation: "NOODLE",
          },
        },
      ]),
    )
    expect(requests(result.collection.items)[0]?.auth).toEqual({
      type: "ntlm",
      username: "$user",
      password: "$password",
      domain: "EXAMPLE",
      workstation: "NOODLE",
    })
  })

  it("maps known OAuth 1 and OAuth 2 authentication fields", () => {
    const result = insomniaImporter.import(
      exportJson([
        { _id: "wrk", _type: "workspace", name: "OAuth" },
        {
          _id: "oauth1",
          _type: "request",
          parentId: "wrk",
          name: "OAuth 1",
          method: "GET",
          url: "https://x",
          authentication: {
            type: "oauth1",
            consumerKey: "{{ consumer_key }}",
            consumerSecret: "{{ consumer_secret }}",
            tokenKey: "{{ access_token }}",
            tokenSecret: "{{ token_secret }}",
            signatureMethod: "HMAC-SHA256",
            addTo: "query",
            includeBodyHash: true,
          },
        },
        {
          _id: "oauth2",
          _type: "request",
          parentId: "wrk",
          name: "OAuth 2",
          method: "GET",
          url: "https://x",
          authentication: {
            type: "oauth2",
            grantType: "client_credentials",
            accessTokenUrl: "https://identity.example/token",
            clientId: "{{ client_id }}",
            clientSecret: "{{ client_secret }}",
            scope: "read write",
            credentialsInBody: false,
            addTo: "query",
          },
        },
      ]),
    )
    const [oauth1, oauth2] = requests(result.collection.items)
    expect(oauth1?.auth).toMatchObject({
      type: "oauth1",
      consumer_key: "$consumer_key",
      consumer_secret: "$consumer_secret",
      access_token: "$access_token",
      access_token_secret: "$token_secret",
      signature_method: "HMAC-SHA256",
      placement: "query",
      include_body_hash: true,
    })
    expect(oauth2?.auth).toMatchObject({
      type: "oauth2",
      grant_type: "client_credentials",
      access_token_url: "https://identity.example/token",
      client_id: "$client_id",
      client_secret: "$client_secret",
      scope: "read write",
      credentials_placement: "basic",
      token_placement: "query",
    })
  })

  it("skips unsupported methods while keeping missing and blank methods as GET", () => {
    const result = insomniaImporter.import(
      exportJson([
        { _id: "wrk", _type: "workspace", name: "Methods" },
        {
          _id: "trace",
          _type: "request",
          parentId: "wrk",
          name: "Trace",
          method: "TRACE",
          url: "https://example.com",
        },
        {
          _id: "missing",
          _type: "request",
          parentId: "wrk",
          name: "Missing",
          url: "https://example.com",
        },
        {
          _id: "blank",
          _type: "request",
          parentId: "wrk",
          name: "Blank",
          method: " ",
          url: "https://example.com",
        },
        {
          _id: "number",
          _type: "request",
          parentId: "wrk",
          name: "Number",
          method: 42,
          url: "https://example.com",
        },
        {
          _id: "post",
          _type: "request",
          parentId: "wrk",
          name: "Post",
          method: " POST ",
          url: "https://example.com",
        },
      ]),
    )
    expect(
      requests(result.collection.items).map((request) => request.name),
    ).toEqual(["Missing", "Blank", "Post"])
    expect(
      requests(result.collection.items).map((request) => request.method),
    ).toEqual(["GET", "GET", "POST"])
  })

  it("uses ascending metaSortKey order before export order", () => {
    const result = insomniaImporter.import(
      exportJson([
        { _id: "wrk", _type: "workspace", name: "Order" },
        {
          _id: "late",
          _type: "request",
          parentId: "wrk",
          name: "Late",
          method: "GET",
          url: "https://example.com",
          metaSortKey: 20,
        },
        {
          _id: "early",
          _type: "request",
          parentId: "wrk",
          name: "Early",
          method: "GET",
          url: "https://example.com",
          metaSortKey: 10,
        },
        {
          _id: "unkeyed",
          _type: "request",
          parentId: "wrk",
          name: "Unkeyed",
          method: "GET",
          url: "https://example.com",
        },
        {
          _id: "also-unkeyed",
          _type: "request",
          parentId: "wrk",
          name: "Also Unkeyed",
          method: "GET",
          url: "https://example.com",
        },
      ]),
    )
    expect(
      requests(result.collection.items).map((request) => request.name),
    ).toEqual(["Early", "Late", "Unkeyed", "Also Unkeyed"])
  })

  it("uses safe unique names for environment files", () => {
    const result = insomniaImporter.import(
      exportJson([
        { _id: "wrk", _type: "workspace", name: "Environments" },
        {
          _id: "one",
          _type: "environment",
          parentId: "wrk",
          name: "../Development",
          data: { one: "1" },
        },
        {
          _id: "two",
          _type: "environment",
          parentId: "wrk",
          name: "--Development",
          data: { two: "2" },
        },
      ]),
    )
    expect(result.environments.map((environment) => environment.name)).toEqual([
      "--Development",
      "--Development-2",
    ])
  })

  it("handles cyclic environment parents without recursing forever", () => {
    const result = insomniaImporter.import(
      exportJson([
        { _id: "wrk", _type: "workspace", name: "Cycles" },
        {
          _id: "one",
          _type: "environment",
          parentId: "two",
          name: "One",
          data: { one: "1" },
        },
        {
          _id: "two",
          _type: "environment",
          parentId: "one",
          name: "Two",
          data: { two: "2" },
        },
      ]),
    )
    expect(result.environments).toEqual([
      { name: "One", vars: { two: "2", one: "1" } },
      { name: "Two", vars: { one: "1", two: "2" } },
    ])
  })

  it("skips a cyclic folder edge while retaining reachable requests", () => {
    const result = insomniaImporter.import(
      exportJson([
        { _id: "wrk", _type: "workspace", name: "Folders" },
        {
          _id: "root",
          _type: "request_group",
          parentId: "wrk",
          name: "Root",
        },
        {
          _id: "child",
          _type: "request_group",
          parentId: "root",
          name: "Child",
        },
        {
          _id: "root",
          _type: "request_group",
          parentId: "child",
          name: "Cycle",
        },
        {
          _id: "request",
          _type: "request",
          parentId: "child",
          name: "Ping",
          method: "GET",
          url: "https://example.com/ping",
        },
      ]),
    )
    expect(
      requests(result.collection.items).map((request) => request.name),
    ).toEqual(["Ping"])
  })

  it("rejects invalid exports and leaves no HTTP requests for the caller to reject", () => {
    expect(() => insomniaImporter.import("{}")).toThrow(
      "expected an Insomnia JSON v4 or v5 export",
    )
    expect(() => insomniaImporter.import(exportJson([]))).toThrow(
      "expected exactly one workspace; export a single project instead",
    )
    expect(() =>
      insomniaImporter.import(
        exportJson([
          { _id: "wrk", _type: "workspace", name: "Invalid" },
          "not a resource",
        ]),
      ),
    ).toThrow("resources must be an array of objects")
    expect(() =>
      insomniaImporter.import(
        exportJson([{ _type: "workspace", name: "Missing ID" }]),
      ),
    ).toThrow("workspace is missing _id")
    expect(() =>
      insomniaImporter.import(
        exportJson([
          { _id: "one", _type: "workspace", name: "One" },
          { _id: "two", _type: "workspace", name: "Two" },
        ]),
      ),
    ).toThrow("expected exactly one workspace; export a single project instead")
    expect(
      insomniaImporter.import(
        exportJson([
          { _id: "wrk", _type: "workspace", name: "Empty" },
          { _id: "ws", _type: "web_socket_request", parentId: "wrk" },
        ]),
      ).collection.items,
    ).toEqual([])
  })
})
