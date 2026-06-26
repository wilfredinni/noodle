import { describe, it, expect } from "bun:test"
import { statusBarText } from "../../src/ui/StatusBar"
import { bindingDefaults } from "../../src/ui/keybind"

const defaults = bindingDefaults()

describe("statusBarText", () => {
  it("shows help hint, env label, and action shortcuts", () => {
    const result = statusBarText("prod", defaults)
    expect(result.left).toBe("[?] help")
    expect(result.center).toBe("● prod")
    expect(result.right).toBe("[s] send  [w] save  [t] theme")
  })

  it("reflects custom keybinds", () => {
    const custom = { ...defaults, request_send: "ctrl+s", help_toggle: "f1" }
    const result = statusBarText("dev", custom)
    expect(result.left).toBe("[f1] help")
    expect(result.right).toBe("[ctrl+s] send  [w] save  [t] theme")
  })

  it("shows (no env) when env is empty string", () => {
    const result = statusBarText("", defaults)
    expect(result.center).toBe("(no env)")
  })

  it("each section is a string", () => {
    const result = statusBarText("dev", defaults)
    expect(typeof result.left).toBe("string")
    expect(typeof result.center).toBe("string")
    expect(typeof result.right).toBe("string")
  })
})
