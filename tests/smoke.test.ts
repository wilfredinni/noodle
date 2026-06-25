import { describe, it, expect } from "bun:test"
import { executor } from "../src/requests"
import { openApiImporter } from "../src/converters/openapi"

describe("scaffold stubs", () => {
  it("executor.send throws not-implemented", async () => {
    await expect(executor.send({} as never)).rejects.toThrow("not implemented")
  })
  it("openApiImporter.import throws not-implemented", () => {
    expect(() => openApiImporter.import("")).toThrow("not implemented")
  })
})
