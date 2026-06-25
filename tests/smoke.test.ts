import { describe, it, expect } from "bun:test"
import { openApiImporter } from "../src/converters/openapi"

describe("scaffold stubs", () => {
  it("openApiImporter.import produces a collection from a valid spec", () => {
    const c = openApiImporter.import({
      openapi: "3.0.0",
      info: { title: "Smoke" },
      paths: {
        "/users": { get: { operationId: "listUsers" } },
      },
    })
    expect(c.id).toBe("smoke")
    expect(c.name).toBe("Smoke")
    expect(c.requests).toHaveLength(1)
    expect(c.requests[0].method).toBe("GET")
  })
})
