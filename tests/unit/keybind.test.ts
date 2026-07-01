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
    expect(result.request_send).toBe("ctrl+return")
    expect(result.request_save).toBe("ctrl+s")
    expect(result.help_toggle).toBe("f1")
    expect(result.theme_picker).toBe("ctrl+t")
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

  it("includes layout_toggle with default key ctrl+l", () => {
    const defaults = bindingDefaults()
    expect(defaults.layout_toggle).toBe("ctrl+l")
  })
})

describe("CommandMap", () => {
  it("every definition has a command", () => {
    for (const name of Object.keys(Definitions)) {
      expect(CommandMap).toHaveProperty(name)
    }
  })
})

describe("pane_expand", () => {
  it("has default f2", () => {
    expect(Definitions.pane_expand.default).toBe("f2")
  })

  it("is configurable (not fixed)", () => {
    expect(Definitions.pane_expand.fixed).toBe(false)
  })

  it("is overrideable", () => {
    const result = parseOverrides({ pane_expand: "ctrl+x" })
    expect(result.pane_expand).toBe("ctrl+x")
  })

  it("appears in bindingDefaults", () => {
    const defaults = bindingDefaults()
    expect(defaults.pane_expand).toBe("f2")
  })
})
