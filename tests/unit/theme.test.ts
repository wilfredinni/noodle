import { describe, it, expect } from "bun:test"
import { THEMES, contrastOnPrimary, PaneBorder } from "../../src/ui/theme"

describe("THEMES", () => {
  it("has exactly 2 themes", () => {
    expect(THEMES).toHaveLength(2)
  })

  it("first theme is named opencode", () => {
    expect(THEMES[0]!.name).toBe("opencode")
  })

  it("second theme is named catppuccin", () => {
    expect(THEMES[1]!.name).toBe("catppuccin")
  })

  it("every theme has all 16 required tokens", () => {
    const requiredKeys = [
      "name",
      "primary",
      "secondary",
      "accent",
      "error",
      "warning",
      "success",
      "info",
      "text",
      "textMuted",
      "background",
      "backgroundPanel",
      "backgroundElement",
      "border",
      "borderActive",
      "borderSubtle",
    ]
    for (const theme of THEMES) {
      for (const key of requiredKeys) {
        expect(theme).toHaveProperty(key)
        expect(typeof (theme as unknown as Record<string, unknown>)[key]).toBe(
          "string",
        )
      }
    }
  })

  it("no duplicate theme names", () => {
    const names = THEMES.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it("every color value starts with #", () => {
    const skipKeys = new Set(["name"])
    for (const theme of THEMES) {
      for (const [key, value] of Object.entries(theme)) {
        if (skipKeys.has(key)) continue
        expect(value).toMatch(/^#[0-9a-fA-F]{6}$/)
      }
    }
  })
})

describe("contrastOnPrimary", () => {
  it("returns dark text for opencode primary", () => {
    const result = contrastOnPrimary(THEMES[0]!)
    expect(result).toBe("#1a1a1a")
  })

  it("returns dark text for catppuccin primary", () => {
    const result = contrastOnPrimary(THEMES[1]!)
    expect(result).toBe("#1a1a1a")
  })
})

describe("PaneBorder", () => {
  it("uses thick vertical border chars", () => {
    expect(PaneBorder.customBorderChars.vertical).toBe("┃")
    expect(PaneBorder.customBorderChars.horizontal).toBe(" ")
  })

  it("has left and right borders only", () => {
    expect(PaneBorder.border).toEqual(["left", "right"])
  })

  it("has empty corner characters", () => {
    expect(PaneBorder.customBorderChars.topLeft).toBe("")
    expect(PaneBorder.customBorderChars.bottomLeft).toBe("")
    expect(PaneBorder.customBorderChars.topRight).toBe("")
    expect(PaneBorder.customBorderChars.bottomRight).toBe("")
  })
})
