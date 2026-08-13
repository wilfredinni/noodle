import { describe, it, expect } from "bun:test"
import {
  Definitions,
  CommandMap,
  parseOverrides,
  bindingDefaults,
  displayKey,
  findKeybindConflict,
  keyEventToBinding,
  keybindOverrides,
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
    const result = parseOverrides({ request_save: "ctrl+x", help_toggle: "f1" })
    expect(result.request_save).toBe("ctrl+x")
    expect(result.help_toggle).toBe("f1")
    expect(result.request_send).toBe("ctrl+return")
  })

  it("configures the picker and editor independently", () => {
    const result = parseOverrides({
      env_picker: "ctrl+e",
      env_editor: "shift+e",
      env_secret: "x",
      env_reveal: "v",
    })
    expect(result.env_picker).toBe("ctrl+e")
    expect(result.env_editor).toBe("shift+e")
    expect(result.env_secret).toBe("x")
    expect(result.env_reveal).toBe("v")
  })

  it("ignores fixed key overrides (uses default)", () => {
    const result = parseOverrides({
      focus_next: "ctrl+n",
      request_send: "ctrl+x",
    })
    expect(result.focus_next).toBe("tab")
    expect(result.request_send).toBe("ctrl+return")
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

  it("includes response_query with default key /", () => {
    const defaults = bindingDefaults()
    expect(defaults.response_query).toBe("/")
  })

  it("includes settings_open with default key f4", () => {
    expect(bindingDefaults().settings_open).toBe("f4")
    expect(CommandMap.settings_open).toBe("app.settings-open")
  })
})

describe("shortcut editing", () => {
  const event = (
    name: string,
    modifiers: Partial<{
      ctrl: boolean
      shift: boolean
      option: boolean
      meta: boolean
      super: boolean
      hyper: boolean
    }> = {},
  ) => ({
    name,
    ctrl: false,
    shift: false,
    option: false,
    meta: false,
    super: false,
    hyper: false,
    ...modifiers,
  })

  it("normalizes supported modifier chords and rejects reserved input", () => {
    expect(keyEventToBinding(event("K", { ctrl: true, shift: true }))).toBe(
      "ctrl+shift+k",
    )
    expect(keyEventToBinding(event("x", { option: true }))).toBe("alt+x")
    expect(keyEventToBinding(event("x", { meta: true }))).toBe("alt+x")
    expect(keyEventToBinding(event("x", { super: true }))).toBeNull()
    expect(keyEventToBinding(event("c", { ctrl: true }))).toBeNull()
    expect(keyEventToBinding(event("g", { ctrl: true }))).toBeNull()
    expect(keyEventToBinding(event("f5"))).toBeNull()
    expect(keyEventToBinding(event("escape"))).toBeNull()
    expect(keyEventToBinding(event("unknown-key"))).toBeNull()
  })

  it("detects conflicts only across overlapping activation contexts", () => {
    const keybinds = bindingDefaults()
    expect(findKeybindConflict("request_save", "ctrl+s", keybinds)).toBeNull()
    expect(findKeybindConflict("request_save", "f4", keybinds)).toBe(
      "settings_open",
    )
    expect(findKeybindConflict("env_save", "s", keybinds)).toBe("env_secret")
    expect(findKeybindConflict("browse_delete", "r", keybinds)).toBe(
      "env_reveal",
    )
  })

  it("serializes only non-default, non-fixed overrides", () => {
    const keybinds = {
      ...bindingDefaults(),
      request_save: "ctrl+x",
      request_send: "f9",
    }
    expect(keybindOverrides(keybinds)).toEqual({ request_save: "ctrl+x" })
  })

  it("preserves pre-existing conflicts for the UI to report", () => {
    const keybinds = {
      ...bindingDefaults(),
      request_save: "ctrl+x",
      request_new: "ctrl+x",
    }
    expect(findKeybindConflict("request_save", "ctrl+x", keybinds)).toBe(
      "request_new",
    )
    expect(keybindOverrides(keybinds)).toMatchObject({
      request_save: "ctrl+x",
      request_new: "ctrl+x",
    })
  })
})

describe("CommandMap", () => {
  it("every definition has a command", () => {
    for (const name of Object.keys(Definitions)) {
      expect(CommandMap).toHaveProperty(name)
    }
  })
})

describe("env_picker", () => {
  it("opens the environment picker with e by default", () => {
    expect(Definitions.env_picker.default).toBe("e")
    expect(CommandMap.env_picker).toBe("env.picker-open")
  })
})

describe("env_editor", () => {
  it("opens the environment editor with f3 by default", () => {
    expect(Definitions.env_editor.default).toBe("f3")
    expect(CommandMap.env_editor).toBe("env.editor-open")
  })
})

describe("request_send", () => {
  it("has default ctrl+return", () => {
    expect(Definitions.request_send.default).toBe("ctrl+return")
  })

  it("is fixed", () => {
    expect(Definitions.request_send.fixed).toBe(true)
  })

  it("ignores overrides", () => {
    const result = parseOverrides({ request_send: "ctrl+x" })
    expect(result.request_send).toBe("ctrl+return")
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

describe("request_edit_overlay", () => {
  it("has default ctrl+e", () => {
    expect(Definitions.request_edit_overlay.default).toBe("ctrl+e")
  })

  it("is configurable (not fixed)", () => {
    expect(Definitions.request_edit_overlay.fixed).toBe(false)
  })

  it("is overrideable", () => {
    const result = parseOverrides({ request_edit_overlay: "ctrl+x" })
    expect(result.request_edit_overlay).toBe("ctrl+x")
  })

  it("appears in bindingDefaults", () => {
    const defaults = bindingDefaults()
    expect(defaults.request_edit_overlay).toBe("ctrl+e")
  })
})

describe("request_edit_yaml", () => {
  it("has default ctrl+alt+e", () => {
    expect(Definitions.request_edit_yaml.default).toBe("ctrl+alt+e")
  })

  it("is configurable (not fixed)", () => {
    expect(Definitions.request_edit_yaml.fixed).toBe(false)
  })

  it("is overrideable", () => {
    const result = parseOverrides({ request_edit_yaml: "ctrl+z" })
    expect(result.request_edit_yaml).toBe("ctrl+z")
  })

  it("appears in bindingDefaults", () => {
    const defaults = bindingDefaults()
    expect(defaults.request_edit_yaml).toBe("ctrl+alt+e")
  })
})

describe("cookie jar shortcuts", () => {
  it("uses edit, delete, and bulk-delete conventions", () => {
    expect(Definitions.cookie_edit.default).toBe("ctrl+e")
    expect(Definitions.cookie_delete.default).toBe("ctrl+w")
    expect(Definitions.cookie_clear.default).toBe("ctrl+shift+w")
  })
})

describe("collection_switcher", () => {
  it("has default ctrl+o", () => {
    expect(Definitions.collection_switcher.default).toBe("ctrl+o")
  })

  it("is configurable (not fixed)", () => {
    expect(Definitions.collection_switcher.fixed).toBe(false)
  })

  it("is overrideable", () => {
    const result = parseOverrides({ collection_switcher: "ctrl+x" })
    expect(result.collection_switcher).toBe("ctrl+x")
  })

  it("appears in bindingDefaults", () => {
    const defaults = bindingDefaults()
    expect(defaults.collection_switcher).toBe("ctrl+o")
  })
})

describe("jump_mode", () => {
  it("has default g", () => {
    expect(Definitions.jump_mode.default).toBe("g")
  })

  it("is configurable (not fixed)", () => {
    expect(Definitions.jump_mode.fixed).toBe(false)
  })

  it("is overrideable", () => {
    const result = parseOverrides({ jump_mode: "'" })
    expect(result.jump_mode).toBe("'")
  })

  it("appears in bindingDefaults", () => {
    const defaults = bindingDefaults()
    expect(defaults.jump_mode).toBe("g")
  })

  it("maps to jump.enter command", () => {
    expect(CommandMap.jump_mode).toBe("jump.enter")
  })
})

describe("request_find", () => {
  it("has default ctrl+f", () => {
    expect(Definitions.request_find.default).toBe("ctrl+f")
  })

  it("is configurable and appears in defaults", () => {
    expect(Definitions.request_find.fixed).toBe(false)
    expect(parseOverrides({ request_find: "ctrl+g" }).request_find).toBe(
      "ctrl+g",
    )
    expect(bindingDefaults().request_find).toBe("ctrl+f")
  })
})

describe("displayKey", () => {
  it("transforms ctrl+return to ^return", () => {
    expect(displayKey("ctrl+return")).toBe("^return")
  })

  it("transforms ctrl+s to ^s", () => {
    expect(displayKey("ctrl+s")).toBe("^s")
  })

  it("preserves non-ctrl keys unchanged", () => {
    expect(displayKey("f1")).toBe("f1")
    expect(displayKey("shift+tab")).toBe("shift+tab")
  })

  it("only replaces leading ctrl+ prefix", () => {
    expect(displayKey("ctrl+alt+e")).toBe("^alt+e")
  })
})
