import { createContext, useContext, useRef, useEffect } from "react"
import type { ReactNode } from "react"
import { THEMES } from "./theme-data"
import type { Theme } from "./theme-data"

export {
  THEMES,
  contrastOnPrimary,
  PaneBorder,
  opencodeTheme,
  catppuccinTheme,
} from "./theme-data"
export type { Theme, CustomBorderChars } from "./theme-data"

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
  previewIndex,
}: {
  previewIndex: number | null
}) {
  const theme = useTheme()
  const scrollRef = useRef<import("@opentui/core").ScrollBoxRenderable | null>(
    null,
  )

  useEffect(() => {
    if (previewIndex !== null && previewIndex >= 0) {
      scrollRef.current?.scrollChildIntoView(`theme-${previewIndex}`)
    }
  }, [previewIndex])

  return (
    <box
      style={{
        flexDirection: "column",
        flexGrow: 1,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <box
        style={{
          border: true,
          borderColor: theme.primary,
          flexDirection: "column",
          padding: 1,
          gap: 1,
        }}
        title="▸ Themes"
      >
        <scrollbox
          ref={scrollRef}
          scrollY
          style={{ flexDirection: "column", gap: 1 }}
        >
          {THEMES.map((t, i) => {
            const isSelected = i === previewIndex
            return (
              <box
                key={t.name}
                id={`theme-${i}`}
                paddingLeft={1}
                paddingRight={1}
                backgroundColor={isSelected ? theme.primary : undefined}
              >
                <text fg={isSelected ? "#1a1a1a" : theme.text}>
                  {isSelected ? "▸ " : "  "}
                  {t.name}
                </text>
              </box>
            )
          })}
        </scrollbox>
        <text fg={theme.textMuted}>
          {"[↑/↓] navigate  [Enter] choose  [Esc] cancel"}
        </text>
      </box>
    </box>
  )
}
