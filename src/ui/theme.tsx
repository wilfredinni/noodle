import { createContext, useContext, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { useKeyboard } from "@opentui/react"
import { THEMES, contrastOnPrimary, PaneBorder, type Theme } from "./theme-data"

export { THEMES, contrastOnPrimary, PaneBorder, opencodeTheme, catppuccinTheme } from "./theme-data"
export type { Theme, CustomBorderChars } from "./theme-data"

const ThemeContext = createContext<Theme>(THEMES[0]!)

export function useTheme(): Theme {
  return useContext(ThemeContext)
}

export function ThemeProvider({
  children,
  isSelectingRef,
  previewIndexRef,
  blocking,
}: {
  children: ReactNode
  isSelectingRef: React.MutableRefObject<boolean>
  previewIndexRef: React.MutableRefObject<number | null>
  blocking: () => boolean
}) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)

  useEffect(() => {
    isSelectingRef.current = previewIndex !== null
    previewIndexRef.current = previewIndex
  })

  useKeyboard((key) => {
    if (blocking()) return
    if (previewIndex !== null) {
      if (key.name === "escape") {
        setPreviewIndex(null)
        return
      }
      if (key.name === "up") {
        setPreviewIndex(
          (prev) => ((prev ?? activeIndex) - 1 + THEMES.length) % THEMES.length,
        )
        return
      }
      if (key.name === "down") {
        setPreviewIndex(
          (prev) => ((prev ?? activeIndex) + 1) % THEMES.length,
        )
        return
      }
      if (key.name === "return") {
        setActiveIndex(previewIndex)
        setPreviewIndex(null)
        return
      }
      setPreviewIndex(null)
      return
    }
    if (key.name === "t") {
      setPreviewIndex(activeIndex)
    }
  })

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
  const scrollRef = useRef<import("@opentui/core").ScrollBoxRenderable | null>(null)

  useEffect(() => {
    if (previewIndex !== null && previewIndex >= 0) {
      scrollRef.current?.scrollChildIntoView(`theme-${previewIndex}`)
    }
  }, [previewIndex])

  return (
    <box
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.6)",
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
        title={`▸ Themes`}
        titleColor={theme.primary}
      >
        <scrollbox ref={scrollRef} scrollY style={{ flexDirection: "column" }}>
          {THEMES.map((t, i) => {
            const isSelected = i === previewIndex
            return (
              <text
                key={t.name}
                id={`theme-${i}`}
                fg={isSelected ? "#1a1a1a" : theme.text}
                bg={isSelected ? theme.primary : undefined}
              >
                {isSelected ? "▸ " : "  "}
                {t.name}
              </text>
            )
          })}
        </scrollbox>
        <box style={{ flexDirection: "column", gap: 0 }}>
          <text fg={theme.textMuted}>
            {"[↑/↓] navigate  [Enter] choose  [Esc] cancel"}
          </text>
        </box>
      </box>
    </box>
  )
}
