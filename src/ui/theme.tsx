import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import type { ReactNode } from "react"
import {
  CliRenderEvents,
  TextAttributes,
  type TerminalColors,
} from "@opentui/core"
import { useRenderer } from "@opentui/react"
import {
  contrastOnPrimary,
  generateSystemTheme,
  systemTheme,
  THEMES,
} from "./theme-data"
import type { Theme } from "./theme-data"
import { PickerOverlay } from "./overlays/PickerOverlay"

export {
  THEMES,
  DEFAULT_THEME_INDEX,
  DEFAULT_THEME_NAME,
  contrastOnPrimary,
  contrastOnSecondary,
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
  systemTheme,
  catppuccinFrappeTheme,
  catppuccinMacchiatoTheme,
  claudeCodeTheme,
  cobalt2Theme,
  cursorTheme,
  flexokiTheme,
  githubTheme,
  matrixTheme,
  mercuryTheme,
  nightowlTheme,
  noodleTheme,
  orngTheme,
  osakaJadeTheme,
  palenightTheme,
  vercelTheme,
  vesperTheme,
  zenburnTheme,
  generateSystemTheme,
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
  const renderer = useRenderer()
  const selectedTheme = THEMES[previewIndex ?? activeIndex]!
  const [detectedSystemTheme, setDetectedSystemTheme] = useState(systemTheme)

  useEffect(() => {
    if (selectedTheme.name !== "system") {
      setDetectedSystemTheme(systemTheme)
      return
    }

    let cancelled = false
    let signature: string | undefined
    let refreshing = false
    let refreshQueued = false
    const applyPalette = (colors?: TerminalColors) => {
      if (cancelled) return
      const mode = renderer.themeMode === "light" ? "light" : "dark"
      const next = colors
        ? (generateSystemTheme(colors, mode) ?? systemTheme)
        : systemTheme
      const nextSignature = colors
        ? `${mode}:${JSON.stringify(colors)}`
        : "fallback"
      if (signature === nextSignature) return
      signature = nextSignature
      setDetectedSystemTheme(next)
    }
    const refresh = () => {
      if (cancelled) return
      if (refreshing) {
        refreshQueued = true
        return
      }
      refreshing = true
      renderer.clearPaletteCache()
      void renderer
        .getPalette({ size: 16 })
        .then(applyPalette)
        .catch(() => applyPalette())
        .finally(() => {
          refreshing = false
          if (cancelled || !refreshQueued) return
          refreshQueued = false
          refresh()
        })
    }
    const handleThemeNotification = (sequence: string) => {
      if (sequence !== "\x1b[?997;1n" && sequence !== "\x1b[?997;2n") {
        return false
      }
      queueMicrotask(refresh)
      return false
    }

    renderer.on(CliRenderEvents.PALETTE, applyPalette)
    renderer.prependInputHandler(handleThemeNotification)
    refresh()

    return () => {
      cancelled = true
      renderer.off(CliRenderEvents.PALETTE, applyPalette)
      renderer.removeInputHandler(handleThemeNotification)
    }
  }, [renderer, selectedTheme.name])

  const activeTheme =
    selectedTheme.name === "system" ? detectedSystemTheme : selectedTheme

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
      const highlightedForeground = contrastOnPrimary(theme)
      return (
        <>
          {isCurrent && (
            <text fg={highlighted ? highlightedForeground : theme.primary}>
              ●
            </text>
          )}
          {!isCurrent && <box width={1} />}
          <text
            fg={
              highlighted
                ? highlightedForeground
                : isCurrent
                  ? theme.primary
                  : theme.text
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
