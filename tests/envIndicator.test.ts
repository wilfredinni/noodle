import { describe, it, expect } from "bun:test"
import { envIndicatorLabel } from "../src/ui/envIndicator"
import type { Environment } from "../src/schema"

const env = (name: string): Environment => ({ name, vars: {} })

describe("envIndicatorLabel", () => {
  it("returns (no env) when names list is empty", () => {
    expect(envIndicatorLabel([], -1, null, null)).toBe("(no env)")
  })

  it("returns (no env) when activeIndex is -1", () => {
    expect(envIndicatorLabel(["dev", "staging"], -1, null, null)).toBe(
      "(no env)",
    )
  })

  it("returns the active name when env is loaded and no error", () => {
    expect(envIndicatorLabel(["dev", "staging"], 0, env("dev"), null)).toBe(
      "dev",
    )
    expect(envIndicatorLabel(["dev", "staging"], 1, env("staging"), null)).toBe(
      "staging",
    )
  })

  it("returns (no env) when activeIndex valid but activeEnv is null and error is null", () => {
    expect(envIndicatorLabel(["dev"], 0, null, null)).toBe("(no env)")
  })

  it("appends load failure when error is set", () => {
    const e = new Error("env.load: YAML syntax: bad")
    expect(envIndicatorLabel(["foo"], 0, null, e)).toBe(
      "foo (load failed: env.load: YAML syntax: bad)",
    )
  })

  it("truncates long error reason past 60 chars", () => {
    const long = new Error("x".repeat(120))
    const out = envIndicatorLabel(["foo"], 0, null, long)
    expect(out.length).toBeLessThanOrEqual(
      "foo (load failed: ".length + 60 + ")".length,
    )
    expect(out.includes("…")).toBe(true)
  })

  it("returns (no env) when activeIndex is -1 and error set (defensive guard)", () => {
    const e = new Error("boom")
    expect(envIndicatorLabel(["dev"], -1, null, e)).toBe("(no env)")
  })
})
