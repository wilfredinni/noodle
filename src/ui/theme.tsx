import { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from "react"
import type { ReactNode } from "react"
import { TextAttributes } from "@opentui/core"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useKeymap } from "@opentui/keymap/react"
import { Overlay } from "./Overlay"
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
  catppuccinMacchiatoTheme,
  cobalt2Theme,
  cursorTheme,
  flexokiTheme,
  githubTheme,
  matrixTheme,
  mercuryTheme,
  nightowlTheme,
  orngTheme,
  osakaJadeTheme,
  palenightTheme,
  vercelTheme,
  vesperTheme,
  zenburnTheme,
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
  visible,
  activeIndex,
  previewIndex,
  setPreviewIndex,
  onThemeChange,
}: {
  visible: boolean
  activeIndex: number
  previewIndex: number
  setPreviewIndex: (n: number | null) => void
  onThemeChange: (index: number) => void
}) {
  const theme = useTheme()
  const keymap = useKeymap()
  const [search, setSearch] = useState("")
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
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
    scrollRef.current?.scrollChildIntoView(`theme-${previewIndex}`)
  }, [previewIndex])

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
    <Overlay visible={visible} width={48} gap={1} padding={1}>
        <box paddingLeft={4} paddingRight={4}>
          <box flexDirection="row" justifyContent="space-between">
            <text fg={theme.text}>Themes</text>
            <text fg={theme.textMuted}>esc</text>
          </box>
          <box paddingTop={1}>
            <input
              ref={inputRef}
              value={search}
              onInput={(e: string) => setSearch(e)}
              placeholder="Search themes..."
              placeholderColor={theme.textMuted}
              focusedBackgroundColor={theme.backgroundPanel}
              cursorColor={theme.primary}
              focusedTextColor={theme.textMuted}
            />
          </box>
        </box>
        <scrollbox
          ref={scrollRef}
          scrollY
          paddingLeft={1}
          paddingRight={1}
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
                  id={`theme-${i}`}
                  style={{
                    flexDirection: "row",
                    paddingLeft: isCurrent ? 1 : 3,
                    paddingRight: 3,
                    gap: 1,
                    backgroundColor: isSelected ? theme.primary : undefined,
                  }}
                >
                  {isCurrent && (
                    <text fg={isSelected ? "#1a1a1a" : theme.primary}>●</text>
                  )}
                  <text
                    fg={
                      isSelected
                        ? "#1a1a1a"
                        : isCurrent
                          ? theme.primary
                          : theme.text
                    }
                    attributes={isSelected ? TextAttributes.BOLD : undefined}
                  >
                    {t.name}
                  </text>
                </box>
              )
            })}
            {filtered.length === 0 && (
              <box paddingLeft={3} paddingTop={1}>
                <text fg={theme.textMuted}>No results found</text>
              </box>
            )}
          </box>
        </scrollbox>
    </Overlay>
  )
}
