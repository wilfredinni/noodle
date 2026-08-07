import { describe, it, expect } from "bun:test"
import { act } from "react"
import { testRender } from "@opentui/react/test-utils"
import { createTestKeymap } from "@opentui/keymap/testing"
import {
  registerEnabledFields,
  registerDefaultKeys,
} from "@opentui/keymap/addons"
import { KeymapProvider } from "@opentui/keymap/react"
import type { KeymapProviderProps } from "@opentui/keymap/react"
import { ThemeProvider } from "../../src/ui/theme"
import { CollectionSwitcherOverlay } from "../../src/ui/overlays/CollectionSwitcherOverlay"

function setupKeymap() {
  const { keymap, cleanup: hostCleanup } = createTestKeymap()
  const disposeEnabled = registerEnabledFields(keymap)
  const disposeKeys = registerDefaultKeys(keymap)
  keymap.setData("app.mode", "base")
  keymap.setData("app.focus", "sidebar")
  keymap.setData("app.overlay", "none")
  return {
    keymap: keymap as unknown as KeymapProviderProps["keymap"],
    cleanup: () => {
      disposeEnabled()
      disposeKeys()
      hostCleanup()
    },
  }
}

const collections = [
  "/Users/test/projects/api",
  "/Users/test/projects/admin",
  "/tmp/other",
]

describe("CollectionSwitcherOverlay", () => {
  it("renders the active collection and path", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <CollectionSwitcherOverlay
            visible
            collections={collections}
            activeCollectionDir={collections[1]!}
            onSelect={() => {}}
            onClose={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 24 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Collections")
    expect(frame).toContain("admin")
    expect(frame).toContain("/Users/test/projects/admin")
    expect(frame).toContain("●")
    cleanup()
  })

  it("filters collections by search text", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <CollectionSwitcherOverlay
            visible
            collections={collections}
            activeCollectionDir={collections[1]!}
            onSelect={() => {}}
            onClose={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 24 },
    )
    await renderOnce()
    await act(async () => {
      await mockInput.typeText("api")
    })
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("api")
    expect(frame).not.toContain("admin")
    expect(frame).not.toContain("/tmp/other")
    cleanup()
  })

  it("truncates long collection paths to one line", async () => {
    const { keymap, cleanup } = setupKeymap()
    const longPath = `/Users/test/${"nested/".repeat(12)}collection`
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <CollectionSwitcherOverlay
            visible
            collections={[longPath]}
            activeCollectionDir={longPath}
            onSelect={() => {}}
            onClose={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 24 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("...")
    expect(frame).not.toContain(longPath)
    expect(
      frame.split("\n").filter((line) => line.includes("nested")),
    ).toHaveLength(1)
    cleanup()
  })
})
