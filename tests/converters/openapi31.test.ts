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

  it.each(["anyOf", "oneOf"])(
    "recognizes null type arrays in %s, including recursive and referenced branches",
    (keyword) => {
      const nullable = { $ref: "#/components/schemas/Null" }
      const components = { schemas: { Null: { type: ["null"] } } }
      expect(
        requestBody(
          { schema: { [keyword]: [nullable, { type: "integer" }] } },
          components,
        ),
      ).toEqual({
        body: 0,
        warnings: undefined,
      })
      expect(
        requestBody({ schema: { [keyword]: [{ type: ["null"] }] } }),
      ).toEqual({
        body: null,
        warnings: undefined,
      })
      const node = { $ref: "#/components/schemas/Node" }
      const Node = {
        properties: { next: { [keyword]: [node, nullable] } },
        required: ["next"],
      }
      expect(
        requestBody(
          { schema: node },
          { schemas: { Node, ...components.schemas } },
        ),
      ).toEqual({
        body: { next: null },
        warnings: undefined,
      })
      expect(
        requestBody({
          schema: {
            [keyword]: [{ type: ["string", "null"] }, { type: ["null"] }],
          },
        }),
      ).toEqual({
        body: "",
        warnings: undefined,
      })
    },
  )

  it("uses items to infer arrays only when no explicit type is given", () => {
    const items = { type: "integer" }
    for (const [schema, body] of [
      [{ type: "string", items }, ""],
      [
        { type: "object", items, properties: { id: { type: "integer" } } },
        { id: 0 },
      ],
      [{ items }, [0]],
      [{ type: "array", items }, [0]],
    ] as const)
      expect(requestBody({ schema })).toEqual({ body, warnings: undefined })
  })

  it("keeps format siblings on multipart file references across a chain", () => {
    const field = { $ref: "#/components/schemas/Alias", description: "upload" }
    const result = openApiImporter.import(
      spec(
        {
          "/upload": {
            post: {
              requestBody: {
                content: {
                  "multipart/form-data": {
                    schema: { properties: { file: field } },
                  },
                },
              },
            },
          },
        },
        {
          components: {
            schemas: {
              Alias: { $ref: "#/components/schemas/Bytes", format: "binary" },
              Bytes: { type: "string" },
            },
          },
        },
      ),
    )
    expect(result.collection.items[0]?.data).toMatchObject({
      bodyType: "multipart",
      formData: [{ name: "file", value: "", type: "file", enabled: true }],
    })
    expect(result.warnings).toBeUndefined()
  })

  it.each(["multipart/form-data", "application/x-www-form-urlencoded"])(
    "warns when %s properties need composition instead of silently dropping fields",
    (mediaType) => {
      const result = openApiImporter.import(
        spec(
          {
            "/items": {
              post: {
                requestBody: {
                  content: {
                    [mediaType]: {
                      schema: {
                        $ref: "#/components/schemas/Base",
                        properties: { note: { type: "string" } },
                      },
                    },
                  },
                },
              },
            },
          },
          {
            components: {
              schemas: {
                Base: {
                  type: "object",
                  required: ["file"],
                  properties: { file: { type: "string", format: "binary" } },
                },
              },
            },
          },
        ),
      )
      expect(result.collection.items[0]?.data).not.toHaveProperty("formData")
      expect(result.warnings).toMatchObject([
        {
          field: "requestBody",
          message: expect.stringContaining("Composed form schema"),
        },
      ])
    },
  )

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

  it("warns when a local reference adds constraints to its target", () => {
    const schema = {
      $ref: "#/components/schemas/Base",
      required: ["name"],
      properties: { name: { type: "string" } },
    }
    const components = { schemas: { Base: { type: "object", example: {} } } }
    const result = requestBody({ schema }, components)
    expect(result.body).toBeUndefined()
    expect(result.warnings).toMatchObject([
      {
        field: "requestBody",
        message: expect.stringContaining("Composed schema"),
      },
    ])
    const supplied = { ...schema, example: { name: "Ada" } }
    for (const candidate of [supplied, { anyOf: [supplied, { type: "null" }] }])
      expect(requestBody({ schema: candidate }, components)).toEqual({
        body: { name: "Ada" },
        warnings: undefined,
      })
    for (const Base of [false, undefined]) {
      const invalid = requestBody({ schema: supplied }, { schemas: { Base } })
      expect(invalid.body).toBeUndefined()
      expect(invalid.warnings).toMatchObject([{ field: "requestBody" }])
    }
  })

  it.each(["anyOf", "oneOf"])(
    "warns when %s has surrounding constraints",
    (keyword) => {
      const schema = {
        type: "object",
        properties: { id: { type: "integer" } },
        required: ["id"],
        [keyword]: [{ type: "object" }],
      }
      const result = requestBody({ schema })
      expect(result.body).toBeUndefined()
      expect(result.warnings).toMatchObject([
        {
          field: "requestBody",
          message: expect.stringContaining("Composed schema"),
        },
      ])
    },
  )

  it("omits an optional annotated reference back to the same model", () => {
    const node = { $ref: "#/components/schemas/Node" }
    const Node = {
      properties: {
        id: { type: "integer" },
        next: { ...node, description: "next" },
      },
    }
    expect(requestBody({ schema: node }, { schemas: { Node } })).toEqual({
      body: { id: 0 },
      warnings: undefined,
    })
  })

  it("terminates a required recursive reference with a nullable type array", () => {
    const node = { $ref: "#/components/schemas/Node" }
    const Node = {
      type: ["object", "null"],
      required: ["next"],
      properties: { next: node },
    }
    expect(requestBody({ schema: node }, { schemas: { Node } })).toEqual({
      body: { next: null },
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
