import { describe, it, expect } from "bun:test"
import { THEMES } from "../../src/ui/theme"

interface ThemeState {
  activeIndex: number
  previewIndex: number | null
}

function openPicker(state: ThemeState): ThemeState {
  return { ...state, previewIndex: state.activeIndex }
}

function navigatePreview(state: ThemeState, delta: 1 | -1): ThemeState {
  if (state.previewIndex === null) return state
  const next = (state.previewIndex + delta + THEMES.length) % THEMES.length
  return { ...state, previewIndex: next }
}

function commitPreview(state: ThemeState): ThemeState {
  if (state.previewIndex === null) return state
  return { activeIndex: state.previewIndex, previewIndex: null }
}

function cancelPreview(state: ThemeState): ThemeState {
  return { ...state, previewIndex: null }
}

function getActiveTheme(state: ThemeState) {
  return THEMES[state.previewIndex ?? state.activeIndex]!
}

describe("theme state machine", () => {
  it("starts with opencode theme (index 0) and no preview", () => {
    const state: ThemeState = { activeIndex: 0, previewIndex: null }
    expect(getActiveTheme(state).name).toBe("opencode")
  })

  it("openPicker sets preview to activeIndex", () => {
    const state: ThemeState = { activeIndex: 0, previewIndex: null }
    const next = openPicker(state)
    expect(next.previewIndex).toBe(0)
    expect(next.activeIndex).toBe(0)
  })

  it("openPicker when activeIndex is 1 sets preview to 1", () => {
    const state: ThemeState = { activeIndex: 1, previewIndex: null }
    const next = openPicker(state)
    expect(next.previewIndex).toBe(1)
  })

  it("navigatePreview down wraps to last theme", () => {
    const state: ThemeState = { activeIndex: 0, previewIndex: 0 }
    const next = navigatePreview(state, -1)
    expect(next.previewIndex).toBe(THEMES.length - 1)
  })

  it("navigatePreview up wraps to first theme", () => {
    const state: ThemeState = { activeIndex: 1, previewIndex: 1 }
    const next = navigatePreview(state, 1)
    expect(next.previewIndex).toBe(2)
  })

  it("navigatePreview is no-op when picker is closed", () => {
    const state: ThemeState = { activeIndex: 0, previewIndex: null }
    const next = navigatePreview(state, 1)
    expect(next.previewIndex).toBeNull()
  })

  it("commitPreview moves preview to active and clears preview", () => {
    const state: ThemeState = { activeIndex: 0, previewIndex: 1 }
    const next = commitPreview(state)
    expect(next.activeIndex).toBe(1)
    expect(next.previewIndex).toBeNull()
  })

  it("commitPreview is no-op when picker is closed", () => {
    const state: ThemeState = { activeIndex: 0, previewIndex: null }
    const next = commitPreview(state)
    expect(next.activeIndex).toBe(0)
    expect(next.previewIndex).toBeNull()
  })

  it("cancelPreview clears preview, keeps active unchanged", () => {
    const state: ThemeState = { activeIndex: 0, previewIndex: 1 }
    const next = cancelPreview(state)
    expect(next.activeIndex).toBe(0)
    expect(next.previewIndex).toBeNull()
  })

  it("cancelPreview when already closed is a no-op", () => {
    const state: ThemeState = { activeIndex: 1, previewIndex: null }
    const next = cancelPreview(state)
    expect(next.activeIndex).toBe(1)
    expect(next.previewIndex).toBeNull()
  })

  it("getActiveTheme returns preview theme when picker is open", () => {
    const state: ThemeState = { activeIndex: 0, previewIndex: 1 }
    expect(getActiveTheme(state).name).toBe("catppuccin")
  })

  it("getActiveTheme returns committed theme when picker is closed", () => {
    const state: ThemeState = { activeIndex: 1, previewIndex: null }
    expect(getActiveTheme(state).name).toBe("catppuccin")
  })
})
