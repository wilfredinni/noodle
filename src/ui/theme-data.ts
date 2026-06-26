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
  backgroundElement: "#1e1e1e",
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
  backgroundElement: "#44475a",
  border: "#44475a",
  borderActive: "#bd93f9",
  borderSubtle: "#191a21",
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
  background: "#2e3440",
  backgroundPanel: "#3b4252",
  backgroundElement: "#434c5e",
  border: "#434c5e",
  borderActive: "#4c566a",
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
  backgroundElement: "#222436",
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
  background: "#282828",
  backgroundPanel: "#3c3836",
  backgroundElement: "#504945",
  border: "#665c54",
  borderActive: "#ebdbb2",
  borderSubtle: "#504945",
}

export const THEMES: Theme[] = [
  opencodeTheme,
  catppuccinTheme,
  draculaTheme,
  nordTheme,
  tokyonightTheme,
  gruvboxTheme,
]

export function contrastOnPrimary(_theme: Theme): string {
  return "#1a1a1a"
}

export { PaneBorder, FullBorder, LeftBar } from "./borders"
export type { CustomBorderChars, BorderPreset } from "./borders"
