import { describe, it, expect, beforeEach } from "bun:test"
import {
  registerImporter,
  detectFormat,
  getImporter,
  supportedFormats,
  clearRegistry,
  type Importer,
} from "../../src/converters/index"

function makeImporter(overrides: Partial<Importer> = {}): Importer {
  return {
    type: "test",
    detect: () => false,
    import: () => ({
      collection: { id: "", name: "", items: [] },
      environments: [],
    }),
    ...overrides,
  }
}

describe("registry", () => {
  beforeEach(() => {
    clearRegistry()
  })
  it("registers an importer and retrieves by type", () => {
    const imp = makeImporter({ type: "openapi" })
    registerImporter(imp)
    expect(getImporter("openapi")).toBe(imp)
  })

  it("returns undefined for unregistered type", () => {
    expect(getImporter("nope")).toBeUndefined()
  })

  it("detectFormat returns first matching importer type", () => {
    const a = makeImporter({ type: "alpha", detect: () => false })
    const b = makeImporter({ type: "beta", detect: () => true })
    registerImporter(a)
    registerImporter(b)
    expect(detectFormat("anything")).toBe("beta")
  })

  it("detectFormat returns null when no importer matches", () => {
    expect(detectFormat("garbage")).toBeNull()
  })

  it("supportedFormats returns all registered type names", () => {
    const imp = makeImporter({ type: "tmp-x" })
    registerImporter(imp)
    expect(supportedFormats()).toContain("tmp-x")
  })

  it("clearRegistry empties the registry", () => {
    registerImporter(makeImporter())
    clearRegistry()
    expect(supportedFormats()).toEqual([])
    expect(detectFormat("x")).toBeNull()
  })
})
