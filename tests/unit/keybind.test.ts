import { describe, it, expect } from "bun:test"
import {
  Definitions,
  CommandMap,
  parseOverrides,
  bindingDefaults,
} from "../../src/ui/keybind"
import type { KeybindName } from "../../src/ui/keybind"

describe("parseOverrides", () => {
  it("returns defaults when overrides is empty", () => {
    const result = parseOverrides({})
    expect(result.request_send).toBe("s")
    expect(result.request_save).toBe("ctrl+s")
    expect(result.help_toggle).toBe("f1")
  })

  it("applies custom keys for configurable bindings", () => {
    const result = parseOverrides({ request_send: "ctrl+s", help_toggle: "f1" })
    expect(result.request_send).toBe("ctrl+s")
    expect(result.help_toggle).toBe("f1")
    expect(result.request_save).toBe("ctrl+s")
  })

  it("ignores fixed key overrides (uses default)", () => {
    const result = parseOverrides({ focus_next: "ctrl+n" })
    expect(result.focus_next).toBe("tab")
  })

  it("throws on unknown key names", () => {
    expect(() => parseOverrides({ unknown_key: "x" })).toThrow()
  })

  it("accepts all known configurable keys", () => {
    const overrides: Record<string, string> = {}
    for (const [name, def] of Object.entries(Definitions)) {
      if (!def.fixed) overrides[name] = "f1"
    }
    const result = parseOverrides(overrides)
    for (const [name, def] of Object.entries(Definitions)) {
      if (!def.fixed) expect(result[name as KeybindName]).toBe("f1")
    }
  })
})

describe("bindingDefaults", () => {
  it("returns all defaults", () => {
    const defaults = bindingDefaults()
    for (const [name, def] of Object.entries(Definitions)) {
      expect((defaults as Record<string, string>)[name]).toBe(def.default)
    }
  })

  it("includes layout_toggle with default key l", () => {
    const defaults = bindingDefaults()
    expect(defaults.layout_toggle).toBe("l")
  })
})

describe("CommandMap", () => {
  it("every definition has a command", () => {
    for (const name of Object.keys(Definitions)) {
      expect(CommandMap).toHaveProperty(name)
    }
  })
})
