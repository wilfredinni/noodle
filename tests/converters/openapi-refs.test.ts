import { describe, it, expect } from "bun:test"
import { parseSpec } from "../../src/converters/openapi/parse"

describe("$ref resolution in parseSpec", () => {
  it("resolves a simple $ref to components/schemas", () => {
    const spec = {
      openapi: "3.0.0",
      info: { title: "Test" },
      paths: {
        "/pets": {
          get: {
            operationId: "listPets",
            parameters: [{ $ref: "#/components/parameters/Limit" }],
          },
        },
      },
      components: {
        parameters: {
          Limit: { name: "limit", in: "query" },
        },
      },
    }
    const n = parseSpec(spec)
    const params = (n.paths["/pets"] as Record<string, unknown>).get as Record<
      string,
      unknown
    >
    expect(params.operationId).toBe("listPets")
    const paramList = params.parameters as Array<Record<string, unknown>>
    expect(paramList[0].name).toBe("limit")
    expect(paramList[0].in).toBe("query")
  })

  it("resolves nested $ref (parameters referencing schemas)", () => {
    const spec = {
      openapi: "3.0.0",
      info: { title: "Test" },
      paths: {
        "/pets": {
          post: {
            operationId: "createPet",
            requestBody: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Pet" },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          Pet: {
            type: "object",
            properties: {
              name: { type: "string" },
              age: { type: "integer" },
            },
          },
        },
      },
    }
    const n = parseSpec(spec)
    const pathItem = n.paths["/pets"] as Record<string, unknown>
    const post = pathItem.post as Record<string, unknown>
    const rb = post.requestBody as Record<string, unknown>
    const content = rb.content as Record<string, unknown>
    const json = content["application/json"] as Record<string, unknown>
    const schema = json.schema as Record<string, unknown>
    expect(schema.type).toBe("object")
    expect((schema.properties as Record<string, unknown>).name).toEqual({
      type: "string",
    })
  })

  it("resolves recursive $ref chains", () => {
    const spec = {
      openapi: "3.0.0",
      info: { title: "Test" },
      paths: {
        "/pets": {
          get: {
            operationId: "listPets",
            parameters: [{ $ref: "#/components/parameters/Ref1" }],
          },
        },
      },
      components: {
        parameters: {
          Ref1: { $ref: "#/components/parameters/Ref2" },
          Ref2: { name: "limit", in: "query" },
        },
      },
    }
    const n = parseSpec(spec)
    const pathItem = n.paths["/pets"] as Record<string, unknown>
    const get = pathItem.get as Record<string, unknown>
    const params = get.parameters as Array<Record<string, unknown>>
    expect(params[0].name).toBe("limit")
    expect(params[0].in).toBe("query")
  })

  it("handles circular $ref gracefully (returns marker)", () => {
    const spec = {
      openapi: "3.0.0",
      info: { title: "Test" },
      paths: {
        "/x": {
          get: {
            operationId: "getX",
            parameters: [{ $ref: "#/components/parameters/Circular" }],
          },
        },
      },
      components: {
        parameters: {
          Circular: { $ref: "#/components/parameters/Circular" },
        },
      },
    }
    const n = parseSpec(spec)
    const pathItem = n.paths["/x"] as Record<string, unknown>
    const get = pathItem.get as Record<string, unknown>
    const params = get.parameters as Array<Record<string, unknown>>
    expect(params[0]).toEqual({
      circular: true,
      ref: "#/components/parameters/Circular",
    })
  })

  it("leaves network refs unresolved", () => {
    const spec = {
      openapi: "3.0.0",
      info: { title: "Test" },
      paths: {
        "/x": {
          get: {
            operationId: "getX",
            parameters: [{ $ref: "https://example.com/schemas/Pet" }],
          },
        },
      },
    }
    const n = parseSpec(spec)
    const pathItem = n.paths["/x"] as Record<string, unknown>
    const get = pathItem.get as Record<string, unknown>
    const params = get.parameters as Array<Record<string, unknown>>
    expect(params[0].$ref).toBe("https://example.com/schemas/Pet")
  })

  it("does not affect specs without $ref", () => {
    const spec = {
      openapi: "3.0.0",
      info: { title: "Test" },
      paths: {
        "/x": {
          get: { operationId: "getX" },
        },
      },
    }
    const n = parseSpec(spec)
    const pathItem = n.paths["/x"] as Record<string, unknown>
    const get = pathItem.get as Record<string, unknown>
    expect(get.operationId).toBe("getX")
  })
})
