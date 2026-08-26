import { describe, expect, it } from "bun:test"
import { load } from "js-yaml"
import { parseJsonPreservingNumbers } from "../../src/lang/formatJson"
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
    expect(load(serialized)).toEqual(value)
  })

  it("preserves JSON number literals beyond JavaScript precision", () => {
    const document = parseJsonPreservingNumbers(
      '{"integer":9007199254740993,"decimal":0.12345678901234567890}',
    ) as object

    expect(serializeOpenApiYaml(document)).toContain(
      "integer: 9007199254740993\ndecimal: 0.12345678901234567890\n",
    )
  })
})
