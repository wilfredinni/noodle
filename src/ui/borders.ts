export interface CustomBorderChars {
  topLeft: string
  bottomLeft: string
  vertical: string
  topRight: string
  bottomRight: string
  horizontal: string
  bottomT: string
  topT: string
  cross: string
  leftT: string
  rightT: string
}

export interface BorderPreset {
  border: readonly ("left" | "right" | "top" | "bottom")[]
  customBorderChars: CustomBorderChars
}

const empty: CustomBorderChars = {
  topLeft: "",
  bottomLeft: "",
  vertical: "",
  topRight: "",
  bottomRight: "",
  horizontal: " ",
  bottomT: "",
  topT: "",
  cross: "",
  leftT: "",
  rightT: "",
}

export const FullBorder: BorderPreset = {
  border: ["left", "right", "top", "bottom"] as const,
  customBorderChars: {
    ...empty,
    vertical: "│",
    horizontal: "─",
    topLeft: "┌",
    topRight: "┐",
    bottomLeft: "└",
    bottomRight: "┘",
    topT: "┬",
    bottomT: "┴",
    leftT: "├",
    rightT: "┤",
    cross: "┼",
  },
}

export const LeftBar: BorderPreset = {
  border: ["left"] as const,
  customBorderChars: {
    ...empty,
    vertical: "┃",
  },
}

export const PaneBorder: BorderPreset = {
  border: ["left", "right"] as const,
  customBorderChars: {
    ...empty,
    vertical: "┃",
  },
}
