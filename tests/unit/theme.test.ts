import { describe, it, expect } from "bun:test"
import { THEMES, contrastOnPrimary } from "../../src/ui/theme"

describe("THEMES", () => {
  it("has exactly 18 themes", () => {
    expect(THEMES).toHaveLength(18)
  })

  const expected = [
    "aura",
    "ayu",
    "carbonfox",
    "catppuccin",
    "catppuccin-frappe",
    "dracula",
    "everforest",
    "gruvbox",
    "kanagawa",
    "material",
    "monokai",
    "nord",
    "onedark",
    "opencode",
    "rosepine",
    "solarized",
    "synthwave84",
    "tokyonight",
  ]

  for (let i = 0; i < expected.length; i++) {
    const nth = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth"]
    it(`${nth[i]!} theme is named ${expected[i]}`, () => {
      expect(THEMES[i]!.name).toBe(expected[i])
    })
  }

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
