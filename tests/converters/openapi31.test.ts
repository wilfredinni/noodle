import { describe, expect, it } from "bun:test"
import { openApiImporter } from "../../src/converters/openapi"
import { substitute } from "../../src/requests/substitute"
import { formatCollectionImportMessage } from "../../src/ui/collectionImport"
import { formatImport } from "../../src/app/humanOutput"

function spec(paths: object, extras: object = {}) {
  return JSON.stringify({
    openapi: "3.1.1",
    info: { title: "Inventory" },
    paths,
    ...extras,
  })
}

function json(media: object) {
  return { content: { "application/json": media } }
}

function requestBody(media: object, components: object = {}) {
  const result = openApiImporter.import(
    spec({ "/items": { post: { requestBody: json(media) } } }, { components }),
  )
  const item = result.collection.items[0]!
  if (item.type !== "request") throw new Error("Expected a request")
  const body = substitute(item.data, {
    name: "default",
    vars: { base_url: "https://example.test" },
  }).body
  return {
    body: body === undefined ? undefined : JSON.parse(body),
    warnings: result.warnings,
  }
}

describe("OpenAPI 3.1 request bodies", () => {
  it("preserves literal examples and local Example Objects in priority order", () => {
    const components = { examples: { saved: { value: [false, 0, null] } } }
    const examples = {
      first: { $ref: "#/components/examples/saved" },
      next: { value: 42 },
    }
    const schema = { examples: [null, 1], example: 2 }
    const literal = {
      $ref: "#/components/examples/saved",
      token: "$token",
      generated: "$random.uuid",
    }
    expect(
      requestBody({ example: literal, examples, schema }, components),
    ).toEqual({ body: literal, warnings: undefined })
    expect(requestBody({ examples, schema }, components).body).toEqual([
      false,
      0,
      null,
    ])
    expect(requestBody({ schema }).body).toBeNull()
    for (const example of [false, 0, "", null])
      expect(requestBody({ schema: { example } }).body).toBe(example)
  })

  it("uses escaped JSON pointers and keeps sibling annotations local to each use", () => {
    const ref = { $ref: "#/components/schemas/A~1B~0C" }
    const schema = {
      type: "object",
      properties: {
        first: { ...ref, examples: [3] },
        second: ref,
        third: { ...ref, example: 0 },
        hidden: { ...ref, readOnly: true },
      },
    }
    expect(
      requestBody(
        { schema },
        { schemas: { "A/B~C": { type: "integer", example: 2 } } },
      ).body,
    ).toEqual({ first: 3, second: 2, third: 0 })
  })

  it("builds nested editable JSON for arrays, nullable fields and component models", () => {
    const schema = {
      type: "array",
      items: { $ref: "#/components/schemas/Item" },
    }
    const Item = {
      properties: {
        title: { type: ["null", "string"] },
        count: { anyOf: [{ type: "null" }, { type: "integer" }] },
        enabled: { type: "boolean" },
      },
    }
    expect(requestBody({ schema }, { schemas: { Item } })).toEqual({
      body: [{ title: "", count: 0, enabled: false }],
      warnings: undefined,
    })
  })

  it("terminates recursive models at nullable, optional or empty array branches", () => {
    const node = { $ref: "#/components/schemas/Node" }
    const Node = {
      type: "object",
      required: ["id", "parent", "children"],
      properties: {
        id: { type: "integer" },
        parent: { anyOf: [node, { type: "null" }] },
        children: { type: "array", items: node },
        optional: node,
      },
    }
    expect(requestBody({ schema: node }, { schemas: { Node } })).toEqual({
      body: { id: 0, parent: null, children: [] },
      warnings: undefined,
    })
  })

  it("keeps requests when the body cannot be generated and omits reference targets from warnings", () => {
    for (const schema of [
      { oneOf: [{ type: "string" }, { type: "integer" }] },
      { type: ["number", "object"] },
      { $ref: "https://example.test/?secret=private-value" },
      { $ref: "./private-value.json" },
      { $ref: "#/components/schemas/private-value" },
    ]) {
      const result = requestBody(
        { schema },
        {
          schemas: {
            "private-value": {
              required: ["nested"],
              properties: { nested: schema },
            },
          },
        },
      )
      expect(result.body).toBeUndefined()
      expect(result.warnings).toMatchObject([
        { itemPath: ["POST /items"], field: "requestBody" },
      ])
      expect(JSON.stringify(result.warnings)).not.toContain("private-value")
    }
  })
})

describe("OpenAPI 3.1 operations", () => {
  it("resolves reusable path items, bodies and parameters in YAML without servers", () => {
    const result = openApiImporter.import(`openapi: 3.1.0
paths:
  /pets/{id}: { $ref: '#/components/pathItems/items' }
components:
  pathItems:
    items:
      parameters: [{ $ref: '#/components/parameters/id' }]
      post:
        requestBody: { $ref: '#/components/requestBodies/input' }
        parameters: [{ name: limit, in: query, example: 0 }, { name: X-Test, in: header, example: false }]
  parameters:
    id: { name: id, in: path, schema: { type: integer, examples: [42] } }
  requestBodies:
    input: { content: { application/json: { example: true } } }
`)
    expect(result.collection.items[0]?.data).toMatchObject({
      url: "$base_url/pets/:id",
      pathParams: [{ name: "id", value: "42" }],
      params: [{ name: "limit", value: "0" }],
      headers: { "X-Test": { value: "false" } },
      body: "true",
    })
    expect(result.environments).toEqual([
      { name: "default", vars: { base_url: "" } },
    ])
    expect(result.warnings).toBeUndefined()
  })

  it("chooses only a complete authentication alternative and honors anonymous overrides", () => {
    const paths = {
      "/inherit": { get: {} },
      "/override": { get: { security: [] } },
      "/alternative": {
        get: {
          security: [{ bearer: [], key: [] }, { cookie: [] }, { key: [] }],
        },
      },
      "/optional": { get: { security: [{}, { bearer: [] }] } },
      "/compound": { get: { security: [{ bearer: [], key: [] }] } },
      "/cookie": { get: { security: [{ cookie: [] }] } },
      "/mtls": { get: { security: [{ cert: [] }] } },
    }
    const { collection, warnings } = openApiImporter.import(
      spec(paths, {
        security: [{ bearer: [] }],
        components: {
          securitySchemes: {
            bearer: { type: "http", scheme: "bearer" },
            key: { type: "apiKey", name: "key", in: "query" },
            cookie: { type: "apiKey", name: "private-value", in: "cookie" },
            cert: { type: "mutualTLS" },
          },
        },
      }),
    )
    expect(
      collection.items.map(
        (item) => item.type === "request" && item.data.auth?.type,
      ),
    ).toEqual(["bearer", "none", "api_key", "none", "none", "none", "none"])
    expect(warnings?.map((w) => w.itemPath[0])).toEqual([
      "GET /compound",
      "GET /cookie",
      "GET /mtls",
    ])
    for (const output of [
      formatCollectionImportMessage(warnings),
      formatImport({ path: "inventory", name: "Inventory", warnings }),
    ]) {
      expect(output).toContain("GET /cookie")
      expect(output).toContain("security")
      expect(output).not.toContain("private-value")
      expect(output).not.toContain("script")
    }
  })

  it("reports skipped incoming operations, TRACE and unresolved paths alongside usable operations", () => {
    const paths = {
      "/orders": {
        trace: {},
        post: {
          callbacks: { paid: {} },
          parameters: [{ $ref: "./private-value" }],
        },
      },
      "/also": { $ref: "https://private-value" },
    }
    const result = openApiImporter.import(
      spec(paths, { webhooks: { incoming: {} } }),
    )
    expect(result.collection.items).toHaveLength(1)
    expect(
      result.warnings?.map((w) => w.format === "openapi" && w.field),
    ).toEqual(["webhooks", "method", "callbacks", "parameters", "path"])
    expect(JSON.stringify(result.warnings)).not.toContain("private-value")
    for (const extras of [
      { components: {} },
      { webhooks: { event: { post: {} } } },
      { paths: { "/x": { trace: {} } } },
    ]) {
      const source = JSON.stringify({ openapi: "3.1.0", ...extras })
      expect(openApiImporter.detect(source)).toBe(true)
      expect(() => openApiImporter.import(source)).toThrow(
        /no supported path operations/i,
      )
    }
  })
})
