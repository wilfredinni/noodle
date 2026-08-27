import { describe, expect, it } from "bun:test"
import { swaggerImporter, parseSwaggerSpec } from "../src/converters/swagger"
import type { CollectionItem, Request } from "../src/schema"

function requests(items: CollectionItem[]): Request[] {
  return items.flatMap((item) =>
    item.type === "request" ? [item.data] : requests(item.data.children),
  )
}

describe("parseSwaggerSpec", () => {
  it("wraps invalid JSON and YAML with the Swagger import error", () => {
    let error: Error | undefined
    try {
      parseSwaggerSpec("{ broken: : :")
    } catch (e) {
      error = e as Error
    }

    expect(error?.message).toContain(
      "converters.swagger.import: failed to parse spec (not valid JSON or YAML):",
    )
    expect(error?.cause).toBeDefined()
  })

  it("validates the Swagger 2.0 document shape", () => {
    expect(() => parseSwaggerSpec({ swagger: "2.1", paths: {} })).toThrow(
      'converters.swagger.import: unsupported or missing "swagger" version, expected "2.0"',
    )
    expect(() => parseSwaggerSpec({ swagger: "2.0" })).toThrow(
      'converters.swagger.import: missing or invalid "paths"',
    )
  })
})

describe("swaggerImporter", () => {
  it("imports refs, params, JSON and form bodies, tags, auth, and HTTPS defaults", () => {
    const result = swaggerImporter.import(`swagger: "2.0"
info:
  title: Pet API
host: api.example.com
basePath: /v1
consumes: [application/json]
security:
  - api_key: []
securityDefinitions:
  api_key:
    type: apiKey
    name: X-API-Key
    in: header
  basic_auth:
    type: basic
parameters:
  limit:
    name: limit
    in: query
    default: 20
definitions:
  Pet:
    type: object
    properties:
      name:
        type: string
paths:
  /pets/{id}:
    parameters:
      - name: id
        in: path
        required: true
        default: 42
    get:
      operationId: getPet
      tags: [pets]
      parameters:
        - $ref: '#/parameters/limit'
    post:
      operationId: createPet
      security:
        - basic_auth: []
      parameters:
        - name: body
          in: body
          schema:
            $ref: '#/definitions/Pet'
  /upload:
    post:
      consumes: [multipart/form-data]
      parameters:
        - name: photo
          in: formData
          type: file
        - name: label
          in: formData
          type: string
  /login:
    post:
      consumes: [application/x-www-form-urlencoded]
      parameters:
        - name: email
          in: formData
          type: string
`)

    const imported = requests(result.collection.items)
    const getPet = imported.find((request) => request.name === "getPet")!
    const createPet = imported.find((request) => request.name === "createPet")!
    const upload = imported.find((request) => request.name === "POST /upload")!
    const login = imported.find((request) => request.name === "POST /login")!

    expect(result.collection.name).toBe("Pet API")
    expect(result.environments).toEqual([
      {
        name: "default",
        vars: {
          base_url: "https://api.example.com/v1",
          api_key: "",
          user: "",
          pass: "",
          name: "",
          label: "",
          email: "",
        },
      },
    ])
    expect(getPet.url).toBe("$base_url/pets/:id")
    expect(getPet.params).toEqual([
      { name: "limit", value: "20", enabled: true },
    ])
    expect(getPet.pathParams).toEqual([
      { name: "id", value: "42", enabled: true },
    ])
    expect(getPet.auth).toEqual({
      type: "api_key",
      key: "X-API-Key",
      value: "$api_key",
      placement: "header",
    })
    expect(createPet.bodyType).toBe("json")
    expect(createPet.body).toBe('{"name":"$name"}')
    expect(createPet.auth).toEqual({
      type: "basic",
      user: "$user",
      pass: "$pass",
    })
    expect(upload.bodyType).toBe("multipart")
    expect(upload.formData).toEqual([
      { name: "photo", value: "", enabled: true, type: "file" },
      { name: "label", value: "$label", enabled: true, type: "text" },
    ])
    expect(login.bodyType).toBe("urlencoded")
    expect(login.formData).toEqual([
      { name: "email", value: "$email", enabled: true, type: "text" },
    ])
  })

  it("uses basePath in relative URLs when host is absent", () => {
    const result = swaggerImporter.import(
      '{"swagger":"2.0","basePath":"v2","paths":{"/pets":{"get":{}}}}',
    )
    expect(requests(result.collection.items)[0]?.url).toBe("/v2/pets")
  })

  it("prefers an operation body parameter over a path-item body parameter", () => {
    const result = swaggerImporter.import(`swagger: "2.0"
consumes: [application/json]
paths:
  /items:
    parameters:
      - name: body
        in: body
        schema:
          properties:
            pathValue: { type: string }
    post:
      parameters:
        - name: body
          in: body
          schema:
            properties:
              operationValue: { type: string }
`)

    expect(requests(result.collection.items)[0]?.body).toBe(
      '{"operationValue":"$operationValue"}',
    )
  })

  it("imports XML request bodies from consumes", () => {
    const result = swaggerImporter.import(`swagger: "2.0"
consumes: [application/xml]
paths:
  /items:
    post:
      parameters:
        - name: body
          in: body
          schema:
            type: string
            example: <root><value>$value</value></root>
`)

    const request = requests(result.collection.items)[0]!
    expect(request.body).toBe("<root><value>$value</value></root>")
    expect(request.bodyType).toBe("xml")
    expect(request.headers["Content-Type"]?.value).toBe("application/xml")
  })

  it("normalizes mixed-case XML consumes media types", () => {
    const result = swaggerImporter.import(`swagger: "2.0"
consumes: [Application/XML]
paths:
  /xml:
    post:
      parameters:
        - name: body
          in: body
          schema:
            type: string
            example: <root />
  /soap:
    post:
      consumes: [Application/SOAP+XML; charset=utf-8]
      parameters:
        - name: body
          in: body
          schema:
            type: string
            example: <Envelope />
`)

    const imported = requests(result.collection.items)
    expect(imported[0]).toMatchObject({
      bodyType: "xml",
      body: "<root />",
    })
    expect(imported[0]?.headers["Content-Type"]?.value).toBe("Application/XML")
    expect(imported[1]).toMatchObject({
      bodyType: "xml",
      body: "<Envelope />",
    })
    expect(imported[1]?.headers["Content-Type"]?.value).toBe(
      "Application/SOAP+XML; charset=utf-8",
    )
  })
})
