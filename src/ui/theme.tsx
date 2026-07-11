import { createContext, useContext, useMemo, useCallback } from "react"
import type { ReactNode } from "react"
import { TextAttributes } from "@opentui/core"
import { THEMES } from "./theme-data"
import type { Theme } from "./theme-data"
import { PickerOverlay } from "./overlays/PickerOverlay"

export {
  THEMES,
  DEFAULT_THEME_INDEX,
  DEFAULT_THEME_NAME,
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
  const items = useMemo(
    () => THEMES.map((t, i) => ({ theme: t, index: i })),
    [],
  )

  const highlightedItem = useMemo(
    () => items[previewIndex] ?? null,
    [previewIndex, items],
  )

  const keyExtractor = useCallback(
    (item: { theme: Theme; index: number }) => item.theme.name,
    [],
  )

  const filter = useCallback(
    (item: { theme: Theme; index: number }, query: string) =>
      item.theme.name.toLowerCase().includes(query.toLowerCase()),
    [],
  )

  const handleHighlightChange = useCallback(
    (item: { theme: Theme; index: number } | null) =>
      setPreviewIndex(item?.index ?? null),
    [setPreviewIndex],
  )

  const handleSelect = useCallback(
    (item: { theme: Theme; index: number }) => {
      onThemeChange(item.index)
      setPreviewIndex(null)
    },
    [onThemeChange, setPreviewIndex],
  )

  const handleClose = useCallback(
    () => setPreviewIndex(null),
    [setPreviewIndex],
  )

  const renderItem = useCallback(
    (
      { theme: t, index: i }: { theme: Theme; index: number },
      { highlighted }: { highlighted: boolean; active: boolean },
    ) => {
      const isCurrent = i === activeIndex
      return (
        <>
          {isCurrent && (
            <text fg={highlighted ? "#1a1a1a" : theme.primary}>●</text>
          )}
          {!isCurrent && <box width={1} />}
          <text
            fg={
              highlighted ? "#1a1a1a" : isCurrent ? theme.primary : theme.text
            }
            attributes={highlighted ? TextAttributes.BOLD : undefined}
          >
            {t.name}
          </text>
        </>
      )
    },
    [activeIndex, theme],
  )

  return (
    <PickerOverlay
      visible={visible}
      title="Themes"
      items={items}
      keyExtractor={keyExtractor}
      filter={filter}
      placeholder="Search themes..."
      highlightedItem={highlightedItem}
      onHighlightChange={handleHighlightChange}
      onSelect={handleSelect}
      onClose={handleClose}
      renderItem={renderItem}
    />
  )
}
