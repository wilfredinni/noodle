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

export const THEMES: Theme[] = [opencodeTheme, catppuccinTheme]

export function contrastOnPrimary(_theme: Theme): string {
  return "#1a1a1a"
}

export { PaneBorder, FullBorder, LeftBar } from "./borders"
export type { CustomBorderChars, BorderPreset } from "./borders"
