import { describe, it, expect } from "bun:test"
import {
  DEFAULT_THEME_INDEX,
  DEFAULT_THEME_NAME,
  THEMES,
  claudeCodeTheme,
  contrastOnPrimary,
  contrastOnSecondary,
  generateSystemTheme,
  noodleTheme,
  palenightTheme,
  systemTheme,
} from "../../src/ui/theme"
import type { TerminalColors } from "@opentui/core"

function terminalColors(
  background: string | null,
  foreground: string | null,
): TerminalColors {
  return {
    palette: [
      background,
      "#aa0000",
      "#00aa00",
      "#aaaa00",
      "#0000aa",
      "#aa00aa",
      "#00aaaa",
      foreground,
      ...Array(8).fill(null),
    ],
    defaultForeground: foreground,
    defaultBackground: background,
    cursorColor: null,
    mouseForeground: null,
    mouseBackground: null,
    tekForeground: null,
    tekBackground: null,
    highlightBackground: null,
    highlightForeground: null,
  }
}

function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = hex
      .match(/[0-9a-f]{2}/gi)!
      .map((channel) => parseInt(channel, 16) / 255)
      .map((channel) =>
        channel <= 0.03928
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4,
      )
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
  }
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light! + 0.05) / (dark! + 0.05)
}

describe("THEMES", () => {
  it("has exactly 35 themes", () => {
    expect(THEMES).toHaveLength(35)
  })

  const expected = [
    "aura",
    "ayu",
    "carbonfox",
    "catppuccin",
    "catppuccin-frappe",
    "catppuccin-macchiato",
    "claude-code",
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
    "noodle",
    "nord",
    "onedark",
    "opencode",
    "orng",
    "osaka-jade",
    "palenight",
    "rosepine",
    "solarized",
    "synthwave84",
    "system",
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
    "thirty-third",
    "thirty-fourth",
    "thirty-fifth",
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

  it("maps Claude Code's dark palette to terminal theme roles", () => {
    expect(claudeCodeTheme).toMatchObject({
      primary: "#da7756",
      secondary: "#b1b9f9",
      success: "#7a8f5f",
      text: "#ffffff",
      background: "#1f1f1f",
      backgroundPanel: "#1f1f1f",
      backgroundElement: "#373737",
      border: "#505050",
      borderActive: "#da7756",
    })

    for (const token of ["error", "success", "info"] as const) {
      expect(
        contrastRatio(claudeCodeTheme[token], claudeCodeTheme.backgroundPanel),
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it("maps the Noodle landing palette to terminal theme roles", () => {
    expect(noodleTheme).toMatchObject({
      primary: "#59c9be",
      secondary: "#f2c65a",
      accent: "#ef7b63",
      success: "#9dcb82",
      text: "#f3efe7",
      textMuted: "#aaa39a",
      background: "#181714",
      backgroundPanel: "#181714",
      backgroundElement: "#24211d",
      border: "#3b3630",
      borderActive: "#59c9be",
      borderSubtle: "#514a42",
    })
  })

  it("uses Noodle as the default theme", () => {
    expect(DEFAULT_THEME_NAME).toBe("noodle")
    expect(THEMES[DEFAULT_THEME_INDEX]).toBe(noodleTheme)
  })
})

describe("contrastOnPrimary", () => {
  it("returns light text for a dark primary", () => {
    expect(contrastOnPrimary({ ...systemTheme, primary: "#003333" })).toBe(
      "#f0f0f0",
    )
  })

  for (let i = 0; i < THEMES.length; i++) {
    const theme = THEMES[i]!
    it(`returns the higher-contrast text for ${theme.name} primary`, () => {
      const result = contrastOnPrimary(theme)
      const other = result === "#1a1a1a" ? "#f0f0f0" : "#1a1a1a"
      expect(contrastRatio(theme.primary, result)).toBeGreaterThanOrEqual(
        contrastRatio(theme.primary, other),
      )
    })
  }
})

describe("generateSystemTheme", () => {
  it("maps ANSI colors and builds opaque dark surfaces", () => {
    const theme = generateSystemTheme(terminalColors("#000000", "#ffffff"))
    expect(theme).toMatchObject({
      primary: "#00aaaa",
      secondary: "#aa00aa",
      accent: "#00aaaa",
      error: "#aa0000",
      warning: "#aaaa00",
      success: "#00aa00",
      info: "#00aaaa",
      text: "#ffffff",
      background: "transparent",
      backgroundPanel: "#000000",
      backgroundElement: "#1a1a1a",
      borderDimmest: "#090909",
      borderSubtle: "#333333",
      border: "#3c3c3c",
      borderActive: "#444444",
    })
  })

  it("builds a darkening surface ramp for light terminals", () => {
    const theme = generateSystemTheme(terminalColors("#ffffff", "#000000"))
    expect(theme).toMatchObject({
      text: "#000000",
      backgroundPanel: "#ffffff",
      backgroundElement: "#e6e6e6",
      borderDimmest: "#f7f7f7",
      borderSubtle: "#cccccc",
      border: "#c3c3c3",
      borderActive: "#bbbbbb",
    })
  })

  it("returns no generated theme when palette detection is unavailable", () => {
    const colors = terminalColors(null, null)
    colors.palette.fill(null)
    expect(generateSystemTheme(colors)).toBeNull()
    expect(systemTheme).toEqual({ ...noodleTheme, name: "system" })
  })
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
