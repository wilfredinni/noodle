import { describe, it, expect } from "bun:test"
import { openApiImporter } from "../src/converters/openapi"

describe("scaffold stubs", () => {
  it("openApiImporter.import throws not-implemented", () => {
    expect(() => openApiImporter.import("")).toThrow("not implemented")
  })
})
