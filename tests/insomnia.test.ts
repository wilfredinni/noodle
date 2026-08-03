import { describe, expect, it } from "bun:test"
import { insomniaImporter } from "../src/converters/insomnia"
import type { CollectionItem, Request } from "../src/schema"

function requests(items: CollectionItem[]): Request[] {
  return items.flatMap((item) =>
    item.type === "request" ? [item.data] : requests(item.data.children),
  )
}

function exportJson(resources: object[]): string {
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
          url: "https://{{ host }}/widgets/:id",
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
      auth: { type: "none" },
    })
    expect(binary).toMatchObject({
      bodyType: "binary",
      filePath: "./payload.bin",
    })
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
