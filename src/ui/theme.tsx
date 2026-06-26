import { createContext, useContext } from "react"
import type { ReactNode } from "react"
import { RGBA } from "@opentui/core"
import { THEMES } from "./theme-data"
import type { Theme } from "./theme-data"

export {
  THEMES,
  contrastOnPrimary,
  opencodeTheme,
  catppuccinTheme,
} from "./theme-data"
export type { Theme } from "./theme-data"
export { PaneBorder, FullBorder, LeftBar } from "./borders"
export type { CustomBorderChars, BorderPreset } from "./borders"

const ThemeContext = createContext<Theme>(THEMES[0]!)

export function useTheme(): Theme {
  return useContext(ThemeContext)
}

export function ThemeProvider({
  children,
  activeIndex,
  previewIndex,
}: {
  children: ReactNode
  activeIndex: number
  previewIndex: number | null
}) {
  const activeTheme = THEMES[previewIndex ?? activeIndex]!

  return (
    <ThemeContext.Provider value={activeTheme}>
      {children}
    </ThemeContext.Provider>
  )
}

export function ThemePickerOverlay({
  activeIndex,
  previewIndex,
}: {
  activeIndex: number
  previewIndex: number | null
}) {
  const theme = useTheme()

  return (
    <box
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: RGBA.fromInts(0, 0, 0, 150),
        flexDirection: "column",
      }}
    >
      <box
        style={{
          width: 48,
          backgroundColor: theme.backgroundPanel,
          flexDirection: "column",
          gap: 1,
          padding: 1,
        }}
      >
        <box
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            paddingLeft: 4,
            paddingRight: 4,
          }}
        >
          <text fg={theme.text}>Themes</text>
          <text fg={theme.textMuted}>esc</text>
        </box>
        <box style={{ flexDirection: "column" }}>
          {THEMES.map((t, i) => {
            const isCurrent = i === activeIndex
            const isSelected = i === previewIndex
            return (
              <box
                key={t.name}
                style={{
                  flexDirection: "row",
                  paddingLeft: isCurrent ? 1 : 3,
                  paddingRight: 3,
                  backgroundColor: isSelected ? theme.primary : undefined,
                }}
              >
                {isCurrent && (
                  <text fg={isSelected ? "#1a1a1a" : theme.primary}>● </text>
                )}
                <text
                  fg={
                    isSelected
                      ? "#1a1a1a"
                      : isCurrent
                        ? theme.primary
                        : theme.text
                  }
                >
                  {t.name}
                </text>
              </box>
            )
          })}
        </box>
      </box>
    </box>
  )
}
