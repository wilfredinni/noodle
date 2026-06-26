import { describe, it, expect } from "bun:test"
import { THEMES, contrastOnPrimary } from "../../src/ui/theme"

describe("THEMES", () => {
  it("has exactly 10 themes", () => {
    expect(THEMES).toHaveLength(10)
  })

  it("first theme is named opencode", () => {
    expect(THEMES[0]!.name).toBe("opencode")
  })

  it("second theme is named catppuccin", () => {
    expect(THEMES[1]!.name).toBe("catppuccin")
  })

  it("third theme is named dracula", () => {
    expect(THEMES[2]!.name).toBe("dracula")
  })

  it("fourth theme is named nord", () => {
    expect(THEMES[3]!.name).toBe("nord")
  })

  it("fifth theme is named tokyonight", () => {
    expect(THEMES[4]!.name).toBe("tokyonight")
  })

  it("sixth theme is named gruvbox", () => {
    expect(THEMES[5]!.name).toBe("gruvbox")
  })

  it("seventh theme is named ayu", () => {
    expect(THEMES[6]!.name).toBe("ayu")
  })

  it("eighth theme is named monokai", () => {
    expect(THEMES[7]!.name).toBe("monokai")
  })

  it("ninth theme is named solarized", () => {
    expect(THEMES[8]!.name).toBe("solarized")
  })

  it("tenth theme is named onedark", () => {
    expect(THEMES[9]!.name).toBe("onedark")
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
  for (let i = 0; i < THEMES.length; i++) {
    const theme = THEMES[i]!
    it(`returns dark text for ${theme.name} primary`, () => {
      const result = contrastOnPrimary(theme)
      expect(result).toBe("#1a1a1a")
    })
  }
})
