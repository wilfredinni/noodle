import { describe, it, expect } from "bun:test"
import {
  THEMES,
  contrastOnPrimary,
  contrastOnSecondary,
  palenightTheme,
} from "../../src/ui/theme"

describe("THEMES", () => {
  it("has exactly 32 themes", () => {
    expect(THEMES).toHaveLength(32)
  })

  const expected = [
    "aura",
    "ayu",
    "carbonfox",
    "catppuccin",
    "catppuccin-frappe",
    "catppuccin-macchiato",
    "cobalt2",
    "cursor",
    "dracula",
    "everforest",
    "flexoki",
    "github",
    "gruvbox",
    "kanagawa",
    "material",
    "matrix",
    "mercury",
    "monokai",
    "nightowl",
    "nord",
    "onedark",
    "opencode",
    "orng",
    "osaka-jade",
    "palenight",
    "rosepine",
    "solarized",
    "synthwave84",
    "tokyonight",
    "vercel",
    "vesper",
    "zenburn",
  ]

  const nth = [
    "first",
    "second",
    "third",
    "fourth",
    "fifth",
    "sixth",
    "seventh",
    "eighth",
    "ninth",
    "tenth",
    "eleventh",
    "twelfth",
    "thirteenth",
    "fourteenth",
    "fifteenth",
    "sixteenth",
    "seventeenth",
    "eighteenth",
    "nineteenth",
    "twentieth",
    "twenty-first",
    "twenty-second",
    "twenty-third",
    "twenty-fourth",
    "twenty-fifth",
    "twenty-sixth",
    "twenty-seventh",
    "twenty-eighth",
    "twenty-ninth",
    "thirtieth",
    "thirty-first",
    "thirty-second",
  ]
  for (let i = 0; i < expected.length; i++) {
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

  it("keeps Pale Night's inactive pane borders visible against panel backgrounds", () => {
    expect(palenightTheme.borderSubtle).not.toBe(palenightTheme.backgroundPanel)
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

describe("contrastOnSecondary", () => {
  it("returns dark text for a light secondary", () => {
    const lightTheme = {
      ...THEMES[0]!,
      secondary: "#ffffff",
    }
    expect(contrastOnSecondary(lightTheme)).toBe("#1a1a1a")
  })

  it("returns light text for a dark secondary", () => {
    const darkTheme = {
      ...THEMES[0]!,
      secondary: "#000000",
    }
    expect(contrastOnSecondary(darkTheme)).toBe("#f0f0f0")
  })

  it("returns dark text for a mid-tone secondary with higher contrast", () => {
    const midToneTheme = {
      ...THEMES[0]!,
      secondary: "#808080",
    }
    expect(contrastOnSecondary(midToneTheme)).toBe("#1a1a1a")
  })

  for (let i = 0; i < THEMES.length; i++) {
    const theme = THEMES[i]!
    const result = contrastOnSecondary(theme)
    it(`returns a valid hex fg for ${theme.name} secondary (${theme.secondary})`, () => {
      expect(result).toMatch(/^#1a1a1a$|^#f0f0f0$/)
    })
  }
})
