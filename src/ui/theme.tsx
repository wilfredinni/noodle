import { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react"
import type { ReactNode } from "react"
import { RGBA } from "@opentui/core"
import { useKeymap } from "@opentui/keymap/react"
import { THEMES } from "./theme-data"
import type { Theme } from "./theme-data"

export {
  THEMES,
  contrastOnPrimary,
  opencodeTheme,
  catppuccinTheme,
  draculaTheme,
  nordTheme,
  tokyonightTheme,
  gruvboxTheme,
  ayuTheme,
  monokaiTheme,
  solarizedTheme,
  onedarkTheme,
  auraTheme,
  everforestTheme,
  kanagawaTheme,
  rosepineTheme,
  materialTheme,
  carbonfoxTheme,
  synthwave84Theme,
  catppuccinFrappeTheme,
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
  setPreviewIndex,
  onThemeChange,
}: {
  activeIndex: number
  previewIndex: number
  setPreviewIndex: (n: number | null) => void
  onThemeChange: (index: number) => void
}) {
  const theme = useTheme()
  const keymap = useKeymap()
  const [search, setSearch] = useState("")
  const inputRef = useCallback((r: unknown) => {
    const input = r as { focus: () => void } | null
    if (input) setTimeout(() => input.focus(), 1)
  }, [])

  const filtered = useMemo(
    () => THEMES.map((t, i) => ({ theme: t, index: i })).filter(
      ({ theme: t }) => t.name.toLowerCase().includes(search.toLowerCase()),
    ),
    [search],
  )

  useEffect(() => {
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const name = ctx.event.name
        if (name === "escape") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          setPreviewIndex(null)
        } else if (name === "up") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          const pos = filtered.findIndex((f) => f.index === previewIndex)
          if (pos > 0) setPreviewIndex(filtered[pos - 1]!.index)
        } else if (name === "down") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          const pos = filtered.findIndex((f) => f.index === previewIndex)
          if (pos < filtered.length - 1) setPreviewIndex(filtered[pos + 1]!.index)
        } else if (name === "return") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          onThemeChange(previewIndex)
          setPreviewIndex(null)
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [filtered, previewIndex, setPreviewIndex, onThemeChange, keymap])

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
        <box paddingLeft={1} paddingRight={1}>
          <input
            ref={inputRef}
            value={search}
            onInput={(e: string) => setSearch(e)}
            placeholder="Search themes..."
            placeholderColor={theme.textMuted}
            focusedBackgroundColor={theme.backgroundElement}
            cursorColor={theme.primary}
            focusedTextColor={theme.text}
          />
        </box>
        <scrollbox
          maxHeight={16}
          scrollbarOptions={{ visible: false }}
        >
          <box style={{ flexDirection: "column" }}>
            {filtered.map(({ theme: t, index: i }) => {
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
            {filtered.length === 0 && (
              <box paddingLeft={3}>
                <text fg={theme.textMuted}>No themes found</text>
              </box>
            )}
          </box>
        </scrollbox>
      </box>
    </box>
  )
}
