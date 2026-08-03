import { describe, expect, it } from "bun:test"
import yaml from "js-yaml"
import { serializeOpenApiYaml } from "../../src/lang/openApiYaml"

describe("serializeOpenApiYaml", () => {
  it("round-trips ordinary numbers and numeric-looking strings", () => {
    const value = {
      integer: 42,
      decimal: 1.5,
      decimalString: "1.50",
      exponentString: "1e3",
    }

    const serialized = serializeOpenApiYaml(value)

    expect(serialized).toContain("integer: 42")
    expect(serialized).toContain("decimal: 1.5")
    expect(serialized).toContain("decimalString: '1.50'")
    expect(serialized).toContain("exponentString: '1e3'")
    expect(yaml.load(serialized)).toEqual(value)
  })
})
