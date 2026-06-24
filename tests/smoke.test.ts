import { describe, it, expect } from "bun:test"
import { filestore } from "../src/filestore"
import { lang } from "../src/lang"
import { executor } from "../src/requests"
import { openApiImporter } from "../src/converters/openapi"

describe("scaffold stubs", () => {
  it("filestore.loadCollection throws not-implemented", async () => {
    await expect(filestore.loadCollection(".")).rejects.toThrow("not implemented")
  })
  it("filestore.saveRequest throws not-implemented", async () => {
    await expect(filestore.saveRequest(".", {} as never)).rejects.toThrow("not implemented")
  })
  it("lang.parseRequest throws not-implemented", () => {
    expect(() => lang.parseRequest("")).toThrow("not implemented")
  })
  it("lang.serializeRequest throws not-implemented", () => {
    expect(() => lang.serializeRequest({} as never)).toThrow("not implemented")
  })
  it("lang.parseCollection throws not-implemented", () => {
    expect(() => lang.parseCollection("")).toThrow("not implemented")
  })
  it("executor.send throws not-implemented", async () => {
    await expect(executor.send({} as never)).rejects.toThrow("not implemented")
  })
  it("openApiImporter.import throws not-implemented", () => {
    expect(() => openApiImporter.import("")).toThrow("not implemented")
  })
})
