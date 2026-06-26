import { describe, it, expect } from "bun:test"
import { statusBarText } from "../../src/ui/StatusBar"

describe("statusBarText", () => {
  it("shows help hint, env label, and action shortcuts", () => {
    const result = statusBarText("prod")
    expect(result.left).toBe("[?] help")
    expect(result.center).toBe("● prod")
    expect(result.right).toBe("[s] send  [w] save  [t] theme")
  })

  it("shows (no env) when env is empty string", () => {
    const result = statusBarText("")
    expect(result.center).toBe("(no env)")
  })

  it("each section is a string", () => {
    const result = statusBarText("dev")
    expect(typeof result.left).toBe("string")
    expect(typeof result.center).toBe("string")
    expect(typeof result.right).toBe("string")
  })
})
