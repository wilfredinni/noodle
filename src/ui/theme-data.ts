import {
  RGBA,
  normalizeTerminalPalette,
  rgbToHex,
  type TerminalColors,
} from "@opentui/core"

export interface Theme {
  name: string
  primary: string
  secondary: string
  accent: string
  error: string
  warning: string
  success: string
  info: string
  text: string
  textMuted: string
  background: string
  backgroundPanel: string
  backgroundElement: string
  border: string
  borderActive: string
  borderSubtle: string
  borderDimmest: string
}

export const opencodeTheme: Theme = {
  name: "opencode",
  primary: "#fab283",
  secondary: "#5c9cf5",
  accent: "#9d7cd8",
  error: "#e06c75",
  warning: "#f5a742",
  success: "#7fd88f",
  info: "#56b6c2",
  text: "#eeeeee",
  textMuted: "#808080",
  background: "#0a0a0a",
  backgroundPanel: "#141414",
  borderDimmest: "#232323",
  backgroundElement: "#252525",
  border: "#484848",
  borderActive: "#606060",
  borderSubtle: "#3c3c3c",
}

export const catppuccinTheme: Theme = {
  name: "catppuccin",
  primary: "#cba6f7",
  secondary: "#89b4fa",
  accent: "#f5c2e7",
  error: "#f38ba8",
  warning: "#fab387",
  success: "#a6e3a1",
  info: "#89dceb",
  text: "#cdd6f4",
  textMuted: "#6c7086",
  background: "#1e1e2e",
  backgroundPanel: "#181825",
  borderDimmest: "#313244",
  backgroundElement: "#313244",
  border: "#45475a",
  borderActive: "#585b70",
  borderSubtle: "#313244",
}

export const draculaTheme: Theme = {
  name: "dracula",
  primary: "#bd93f9",
  secondary: "#ff79c6",
  accent: "#8be9fd",
  error: "#ff5555",
  warning: "#f1fa8c",
  success: "#50fa7b",
  info: "#ffb86c",
  text: "#f8f8f2",
  textMuted: "#6272a4",
  background: "#282a36",
  backgroundPanel: "#21222c",
  borderDimmest: "#3e4051",
  backgroundElement: "#44475a",
  border: "#44475a",
  borderActive: "#bd93f9",
  borderSubtle: "#383b48",
}

export const nordTheme: Theme = {
  name: "nord",
  primary: "#88c0d0",
  secondary: "#81a1c1",
  accent: "#8fbcbb",
  error: "#bf616a",
  warning: "#d08770",
  success: "#a3be8c",
  info: "#88c0d0",
  text: "#eceff4",
  textMuted: "#8b95a7",
  background: "#242933",
  backgroundPanel: "#2e3440",
  borderDimmest: "#3b4252",
  backgroundElement: "#3b4252",
  border: "#3b4252",
  borderActive: "#434c5e",
  borderSubtle: "#434c5e",
}

export const tokyonightTheme: Theme = {
  name: "tokyonight",
  primary: "#82aaff",
  secondary: "#c099ff",
  accent: "#ff966c",
  error: "#ff757f",
  warning: "#ff966c",
  success: "#c3e88d",
  info: "#82aaff",
  text: "#c8d3f5",
  textMuted: "#828bb8",
  background: "#1a1b26",
  backgroundPanel: "#1e2030",
  borderDimmest: "#2a2c41",
  backgroundElement: "#323556",
  border: "#737aa2",
  borderActive: "#9099b2",
  borderSubtle: "#545c7e",
}

export const gruvboxTheme: Theme = {
  name: "gruvbox",
  primary: "#83a598",
  secondary: "#d3869b",
  accent: "#8ec07c",
  error: "#fb4934",
  warning: "#fe8019",
  success: "#b8bb26",
  info: "#fabd2f",
  text: "#ebdbb2",
  textMuted: "#928374",
  background: "#1d2021",
  backgroundPanel: "#282828",
  borderDimmest: "#3c3836",
  backgroundElement: "#3c3836",
  border: "#504945",
  borderActive: "#ebdbb2",
  borderSubtle: "#504945",
}

export const ayuTheme: Theme = {
  name: "ayu",
  primary: "#59c2ff",
  secondary: "#d2a6ff",
  accent: "#e6b450",
  error: "#d95757",
  warning: "#e6b673",
  success: "#7fd962",
  info: "#39bae6",
  text: "#bfbdb6",
  textMuted: "#565b66",
  background: "#0b0e14",
  backgroundPanel: "#0f131a",
  borderDimmest: "#161b26",
  backgroundElement: "#1d2335",
  border: "#6c7380",
  borderActive: "#6c7380",
  borderSubtle: "#222a38",
}

export const monokaiTheme: Theme = {
  name: "monokai",
  primary: "#66d9ef",
  secondary: "#ae81ff",
  accent: "#a6e22e",
  error: "#f92672",
  warning: "#e6db74",
  success: "#a6e22e",
  info: "#fd971f",
  text: "#f8f8f2",
  textMuted: "#75715e",
  background: "#272822",
  backgroundPanel: "#1e1f1c",
  borderDimmest: "#39392f",
  backgroundElement: "#3e3d32",
  border: "#3e3d32",
  borderActive: "#66d9ef",
  borderSubtle: "#49483e",
}

export const solarizedTheme: Theme = {
  name: "solarized",
  primary: "#268bd2",
  secondary: "#6c71c4",
  accent: "#2aa198",
  error: "#dc322f",
  warning: "#b58900",
  success: "#859900",
  info: "#cb4b16",
  text: "#839496",
  textMuted: "#586e75",
  background: "#002b36",
  backgroundPanel: "#073642",
  borderDimmest: "#073642",
  backgroundElement: "#114e5c",
  border: "#586e75",
  borderActive: "#586e75",
  borderSubtle: "#586e75",
}

export const onedarkTheme: Theme = {
  name: "onedark",
  primary: "#61afef",
  secondary: "#c678dd",
  accent: "#56b6c2",
  error: "#e06c75",
  warning: "#e5c07b",
  success: "#98c379",
  info: "#d19a66",
  text: "#abb2bf",
  textMuted: "#5c6370",
  background: "#282c34",
  backgroundPanel: "#21252b",
  borderDimmest: "#343a43",
  backgroundElement: "#3c424e",
  border: "#393f4a",
  borderActive: "#61afef",
  borderSubtle: "#3c414c",
}

export const auraTheme: Theme = {
  name: "aura",
  primary: "#a277ff",
  secondary: "#f694ff",
  accent: "#a277ff",
  error: "#ff6767",
  warning: "#ffca85",
  success: "#61ffca",
  info: "#a277ff",
  text: "#edecee",
  textMuted: "#6d6d6d",
  background: "#0f0f0f",
  backgroundPanel: "#15141b",
  borderDimmest: "#19181e",
  backgroundElement: "#282633",
  border: "#2d2d2d",
  borderActive: "#6d6d6d",
  borderSubtle: "#2d2d2d",
}

export const everforestTheme: Theme = {
  name: "everforest",
  primary: "#a7c080",
  secondary: "#7fbbb3",
  accent: "#d699b6",
  error: "#e67e80",
  warning: "#e69875",
  success: "#a7c080",
  info: "#83c092",
  text: "#d3c6aa",
  textMuted: "#7a8478",
  background: "#1c2226",
  backgroundPanel: "#232a2f",
  borderDimmest: "#2d353b",
  backgroundElement: "#2d353b",
  border: "#333c43",
  borderActive: "#9da9a0",
  borderSubtle: "#384348",
}

export const kanagawaTheme: Theme = {
  name: "kanagawa",
  primary: "#7e9cd8",
  secondary: "#957fb8",
  accent: "#d27e99",
  error: "#e82424",
  warning: "#d7a657",
  success: "#98bb6c",
  info: "#76946a",
  text: "#dcd7ba",
  textMuted: "#727169",
  background: "#1f1f28",
  backgroundPanel: "#2a2a37",
  borderDimmest: "#363646",
  backgroundElement: "#3e3e50",
  border: "#54546d",
  borderActive: "#c38d9d",
  borderSubtle: "#42425a",
}

export const rosepineTheme: Theme = {
  name: "rosepine",
  primary: "#9ccfd8",
  secondary: "#c4a7e7",
  accent: "#ebbcba",
  error: "#eb6f92",
  warning: "#f6c177",
  success: "#31748f",
  info: "#9ccfd8",
  text: "#e0def4",
  textMuted: "#6e6a86",
  background: "#191724",
  backgroundPanel: "#1f1d2e",
  borderDimmest: "#252338",
  backgroundElement: "#33304c",
  border: "#403d52",
  borderActive: "#9ccfd8",
  borderSubtle: "#34324c",
}

export const materialTheme: Theme = {
  name: "material",
  primary: "#82aaff",
  secondary: "#c792ea",
  accent: "#89ddff",
  error: "#f07178",
  warning: "#ffcb6b",
  success: "#c3e88d",
  info: "#ffcb6b",
  text: "#eeffff",
  textMuted: "#546e7a",
  background: "#263238",
  backgroundPanel: "#1e272c",
  borderDimmest: "#33424a",
  backgroundElement: "#37474f",
  border: "#37474f",
  borderActive: "#82aaff",
  borderSubtle: "#37474f",
}

export const carbonfoxTheme: Theme = {
  name: "carbonfox",
  primary: "#33b1ff",
  secondary: "#78a9ff",
  accent: "#ff7eb6",
  error: "#ee5396",
  warning: "#f1c21b",
  success: "#25be6a",
  info: "#78a9ff",
  text: "#f2f4f8",
  textMuted: "#7d848f",
  background: "#161616",
  backgroundPanel: "#1a1a1a",
  borderDimmest: "#1f1f1f",
  backgroundElement: "#2a2a2a",
  border: "#303030",
  borderActive: "#33b1ff",
  borderSubtle: "#303030",
}

export const synthwave84Theme: Theme = {
  name: "synthwave84",
  primary: "#36f9f6",
  secondary: "#ff7edb",
  accent: "#b084eb",
  error: "#fe4450",
  warning: "#fede5d",
  success: "#72f1b8",
  info: "#ff8b39",
  text: "#ffffff",
  textMuted: "#848bbd",
  background: "#262335",
  backgroundPanel: "#1e1a29",
  borderDimmest: "#292038",
  backgroundElement: "#332a45",
  border: "#495495",
  borderActive: "#36f9f6",
  borderSubtle: "#495495",
}

export const catppuccinFrappeTheme: Theme = {
  name: "catppuccin-frappe",
  primary: "#8da4e2",
  secondary: "#ca9ee6",
  accent: "#f4b8e4",
  error: "#e78284",
  warning: "#e5c890",
  success: "#a6d189",
  info: "#81c8be",
  text: "#c6d0f5",
  textMuted: "#949cb8",
  background: "#303446",
  backgroundPanel: "#292c3c",
  borderDimmest: "#2c303f",
  backgroundElement: "#343852",
  border: "#414559",
  borderActive: "#51576d",
  borderSubtle: "#626880",
}

export const catppuccinMacchiatoTheme: Theme = {
  name: "catppuccin-macchiato",
  primary: "#8aadf4",
  secondary: "#c6a0f6",
  accent: "#f5bde6",
  error: "#ed8796",
  warning: "#eed49f",
  success: "#a6da95",
  info: "#8bd5ca",
  text: "#cad3f5",
  textMuted: "#939ab7",
  background: "#24273a",
  backgroundPanel: "#1e2030",
  borderDimmest: "#222432",
  backgroundElement: "#2a2d44",
  border: "#363a4f",
  borderActive: "#494d64",
  borderSubtle: "#5b6078",
}

export const claudeCodeTheme: Theme = {
  name: "claude-code",
  primary: "#da7756",
  secondary: "#b1b9f9",
  accent: "#6a9bcc",
  error: "#ef6f6c",
  warning: "#e0a458",
  success: "#7a8f5f",
  info: "#6a9bcc",
  text: "#ffffff",
  textMuted: "#a0a0a0",
  background: "#1f1f1f",
  backgroundPanel: "#1f1f1f",
  borderDimmest: "#292929",
  backgroundElement: "#373737",
  border: "#505050",
  borderActive: "#da7756",
  borderSubtle: "#3f3f3f",
}

export const cobalt2Theme: Theme = {
  name: "cobalt2",
  primary: "#0088ff",
  secondary: "#9a5feb",
  accent: "#2affdf",
  error: "#ff0088",
  warning: "#ffc600",
  success: "#9eff80",
  info: "#ff9d00",
  text: "#ffffff",
  textMuted: "#adb7c9",
  background: "#193549",
  backgroundPanel: "#122738",
  borderDimmest: "#1c405a",
  backgroundElement: "#1f4662",
  border: "#1f4662",
  borderActive: "#0088ff",
  borderSubtle: "#1c405a",
}

export const cursorTheme: Theme = {
  name: "cursor",
  primary: "#88c0d0",
  secondary: "#81a1c1",
  accent: "#88c0d0",
  error: "#e34671",
  warning: "#f1b467",
  success: "#3fa266",
  info: "#81a1c1",
  text: "#e4e4e4",
  textMuted: "#636363",
  background: "#181818",
  backgroundPanel: "#141414",
  borderDimmest: "#232323",
  backgroundElement: "#262626",
  border: "#2d2d2d",
  borderActive: "#3a3a3a",
  borderSubtle: "#2d2d2d",
}

export const flexokiTheme: Theme = {
  name: "flexoki",
  primary: "#d14d41",
  secondary: "#4385be",
  accent: "#8b7ec8",
  error: "#d14d41",
  warning: "#d14d41",
  success: "#879a39",
  info: "#3aa99f",
  text: "#cecdc3",
  textMuted: "#6f6e69",
  background: "#100f0f",
  backgroundPanel: "#1c1b1a",
  borderDimmest: "#2c2a29",
  backgroundElement: "#302f2e",
  border: "#575653",
  borderActive: "#6f6e69",
  borderSubtle: "#403e3c",
}

export const githubTheme: Theme = {
  name: "github",
  primary: "#58a6ff",
  secondary: "#bc8cff",
  accent: "#39c5cf",
  error: "#f85149",
  warning: "#e3b341",
  success: "#3fb950",
  info: "#d29922",
  text: "#c9d1d9",
  textMuted: "#8b949e",
  background: "#0d1117",
  backgroundPanel: "#010409",
  borderDimmest: "#181d24",
  backgroundElement: "#161b22",
  border: "#30363d",
  borderActive: "#58a6ff",
  borderSubtle: "#21262d",
}

export const matrixTheme: Theme = {
  name: "matrix",
  primary: "#2eff6a",
  secondary: "#00efff",
  accent: "#c770ff",
  error: "#ff4b4b",
  warning: "#e6ff57",
  success: "#62ff94",
  info: "#30b3ff",
  text: "#62ff94",
  textMuted: "#8ca391",
  background: "#0a0e0a",
  backgroundPanel: "#0e130d",
  borderDimmest: "#141c12",
  backgroundElement: "#202d1d",
  border: "#1e2a1b",
  borderActive: "#2eff6a",
  borderSubtle: "#1e2a1b",
}

export const mercuryTheme: Theme = {
  name: "mercury",
  primary: "#8da4f5",
  secondary: "#a7b6f8",
  accent: "#8da4f5",
  error: "#fc92b4",
  warning: "#fc9b6f",
  success: "#77c599",
  info: "#77becf",
  text: "#c3c3cc",
  textMuted: "#9d9da8",
  background: "#171721",
  backgroundPanel: "#10101a",
  borderDimmest: "#272735",
  backgroundElement: "#272735",
  border: "#363644",
  borderActive: "#8da4f5",
  borderSubtle: "#2e2e3e",
}

export const nightowlTheme: Theme = {
  name: "nightowl",
  primary: "#82aaff",
  secondary: "#7fdbca",
  accent: "#c792ea",
  error: "#ef5350",
  warning: "#ecc48d",
  success: "#c5e478",
  info: "#82aaff",
  text: "#d6deeb",
  textMuted: "#5f7e97",
  background: "#011627",
  backgroundPanel: "#0b253a",
  borderDimmest: "#183248",
  backgroundElement: "#1e3c54",
  border: "#5f7e97",
  borderActive: "#82aaff",
  borderSubtle: "#3d5f7a",
}

export const noodleTheme: Theme = {
  name: "noodle",
  primary: "#59c9be",
  secondary: "#f2c65a",
  accent: "#ef7b63",
  error: "#ef7b63",
  warning: "#f0a96b",
  success: "#9dcb82",
  info: "#89b4fa",
  text: "#f3efe7",
  textMuted: "#aaa39a",
  background: "#181714",
  backgroundPanel: "#181714",
  borderDimmest: "#302b26",
  backgroundElement: "#24211d",
  border: "#3b3630",
  borderActive: "#59c9be",
  borderSubtle: "#514a42",
}

export const systemTheme: Theme = { ...noodleTheme, name: "system" }

function mixColor(from: RGBA, to: RGBA, amount: number): RGBA {
  return RGBA.fromValues(
    from.r + (to.r - from.r) * amount,
    from.g + (to.g - from.g) * amount,
    from.b + (to.b - from.b) * amount,
  )
}

export function generateSystemTheme(
  colors: TerminalColors,
  fallbackMode: "dark" | "light" = "dark",
): Theme | null {
  if (
    !colors.defaultForeground &&
    !colors.defaultBackground &&
    !colors.palette.some(Boolean)
  ) {
    return null
  }

  const normalized = normalizeTerminalPalette(colors)
  const background = colors.defaultBackground
    ? RGBA.fromHex(colors.defaultBackground)
    : colors.palette[0]
      ? RGBA.fromHex(colors.palette[0])
      : normalized.defaultBackground
  const foreground = colors.defaultForeground
    ? RGBA.fromHex(colors.defaultForeground)
    : colors.palette[7]
      ? RGBA.fromHex(colors.palette[7])
      : normalized.defaultForeground
  const mode = colors.defaultBackground
    ? 0.299 * background.r + 0.587 * background.g + 0.114 * background.b > 0.5
      ? "light"
      : "dark"
    : fallbackMode
  const rampTarget = RGBA.fromInts(
    mode === "dark" ? 255 : 0,
    mode === "dark" ? 255 : 0,
    mode === "dark" ? 255 : 0,
  )
  const ramp = (step: number) =>
    rgbToHex(mixColor(background, rampTarget, (step / 12) * 0.4))
  const ansi = (index: number) => rgbToHex(normalized.palette[index]!)

  return {
    name: "system",
    primary: ansi(6),
    secondary: ansi(5),
    accent: ansi(6),
    error: ansi(1),
    warning: ansi(3),
    success: ansi(2),
    info: ansi(6),
    text: rgbToHex(foreground),
    textMuted: rgbToHex(mixColor(foreground, background, 0.45)),
    background: "transparent",
    backgroundPanel: rgbToHex(background),
    backgroundElement: ramp(3),
    borderDimmest: ramp(1),
    borderSubtle: ramp(6),
    border: ramp(7),
    borderActive: ramp(8),
  }
}

export const orngTheme: Theme = {
  name: "orng",
  primary: "#ec5b2b",
  secondary: "#ee7948",
  accent: "#fff7f1",
  error: "#e06c75",
  warning: "#ec5b2b",
  success: "#6ba1e6",
  info: "#56b6c2",
  text: "#eeeeee",
  textMuted: "#808080",
  background: "#0a0a0a",
  backgroundPanel: "#141414",
  borderDimmest: "#232323",
  backgroundElement: "#252525",
  border: "#ec5b2b",
  borderActive: "#ee7948",
  borderSubtle: "#3c3c3c",
}

export const osakaJadeTheme: Theme = {
  name: "osaka-jade",
  primary: "#2dd5b7",
  secondary: "#d2689c",
  accent: "#549e6a",
  error: "#ff5345",
  warning: "#e5c736",
  success: "#549e6a",
  info: "#2dd5b7",
  text: "#c1c497",
  textMuted: "#53685b",
  background: "#0c1411",
  backgroundPanel: "#111c18",
  borderDimmest: "#1a2520",
  backgroundElement: "#1a2520",
  border: "#23372b",
  borderActive: "#2dd5b7",
  borderSubtle: "#23372b",
}

export const palenightTheme: Theme = {
  name: "palenight",
  primary: "#82aaff",
  secondary: "#c792ea",
  accent: "#89ddff",
  error: "#f07178",
  warning: "#ffcb6b",
  success: "#c3e88d",
  info: "#f78c6c",
  text: "#a6accd",
  textMuted: "#676e95",
  background: "#292d3e",
  backgroundPanel: "#1e2132",
  borderDimmest: "#2f3346",
  backgroundElement: "#32364a",
  border: "#32364a",
  borderActive: "#82aaff",
  borderSubtle: "#3b3f51",
}

export const vercelTheme: Theme = {
  name: "vercel",
  primary: "#0070f3",
  secondary: "#52a8ff",
  accent: "#8e4ec6",
  error: "#e5484d",
  warning: "#ffb224",
  success: "#46a758",
  info: "#52a8ff",
  text: "#ededed",
  textMuted: "#878787",
  background: "#000000",
  backgroundPanel: "#0a0a0a",
  borderDimmest: "#242424",
  backgroundElement: "#292929",
  border: "#1f1f1f",
  borderActive: "#454545",
  borderSubtle: "#1f1f1f",
}

export const vesperTheme: Theme = {
  name: "vesper",
  primary: "#ffc799",
  secondary: "#99ffe4",
  accent: "#ffc799",
  error: "#ff8080",
  warning: "#ffc799",
  success: "#99ffe4",
  info: "#ffc799",
  text: "#ffffff",
  textMuted: "#a0a0a0",
  background: "#101010",
  backgroundPanel: "#101010",
  borderDimmest: "#121212",
  backgroundElement: "#242424",
  border: "#282828",
  borderActive: "#ffc799",
  borderSubtle: "#2a2a2a",
}

export const zenburnTheme: Theme = {
  name: "zenburn",
  primary: "#8cd0d3",
  secondary: "#dc8cc3",
  accent: "#93e0e3",
  error: "#cc9393",
  warning: "#f0dfaf",
  success: "#7f9f7f",
  info: "#dfaf8f",
  text: "#dcdccc",
  textMuted: "#9f9f9f",
  background: "#3f3f3f",
  backgroundPanel: "#4f4f4f",
  borderDimmest: "#5d5d5d",
  backgroundElement: "#777777",
  border: "#5f5f5f",
  borderActive: "#8cd0d3",
  borderSubtle: "#5f5f5f",
}

export const THEMES: Theme[] = [
  auraTheme,
  ayuTheme,
  carbonfoxTheme,
  catppuccinTheme,
  catppuccinFrappeTheme,
  catppuccinMacchiatoTheme,
  claudeCodeTheme,
  cobalt2Theme,
  cursorTheme,
  draculaTheme,
  everforestTheme,
  flexokiTheme,
  githubTheme,
  gruvboxTheme,
  kanagawaTheme,
  materialTheme,
  matrixTheme,
  mercuryTheme,
  monokaiTheme,
  nightowlTheme,
  noodleTheme,
  nordTheme,
  onedarkTheme,
  opencodeTheme,
  orngTheme,
  osakaJadeTheme,
  palenightTheme,
  rosepineTheme,
  solarizedTheme,
  synthwave84Theme,
  systemTheme,
  tokyonightTheme,
  vercelTheme,
  vesperTheme,
  zenburnTheme,
]

export const DEFAULT_THEME_NAME = "noodle"
export const DEFAULT_THEME_INDEX = THEMES.indexOf(noodleTheme)

function relativeLuminance(hex: string): number {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return 0
  const r = parseInt(m[1]!.slice(0, 2), 16) / 255
  const g = parseInt(m[1]!.slice(2, 4), 16) / 255
  const b = parseInt(m[1]!.slice(4, 6), 16) / 255
  const channel = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrastOn(backgroundColor: string): string {
  const background = relativeLuminance(backgroundColor)
  const dark = relativeLuminance("#1a1a1a")
  const light = relativeLuminance("#f0f0f0")
  const ratio = (a: number, b: number) =>
    (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  return ratio(background, dark) >= ratio(background, light)
    ? "#1a1a1a"
    : "#f0f0f0"
}

export function contrastOnPrimary(theme: Theme): string {
  return contrastOn(theme.primary)
}

export function contrastOnSecondary(theme: Theme): string {
  return contrastOn(theme.secondary)
}

export { PaneBorder, FullBorder, LeftBar } from "./borders"
export type { CustomBorderChars, BorderPreset } from "./borders"
